import { db } from "./firebase.js"; 
import { doc, getDoc, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
let cachedPayload = null; 

// Допоміжна функція для пошуку теми без урахування регістру (Fractions == fractions)
function findTopicCaseInsensitive(data, topic) {
    if (!data) return null;
    
    // 1. Шукаємо в корені
    let topicKey = Object.keys(data).find(k => k.toLowerCase() === topic.toLowerCase());
    
    // 2. Якщо не знайшли, шукаємо в під-об'єкті 'topics' (для сумісності старих структур)
    if (!topicKey && data.topics) {
        const subKeys = Object.keys(data.topics);
        const subKey = subKeys.find(k => k.toLowerCase() === topic.toLowerCase());
        if (subKey) return data.topics[subKey];
    }

    if (topicKey) return data[topicKey];
    return null;
}

// Допоміжна функція для витягування конкретного рівня з даних теми
function getLevelFromTopicData(topicData, level) {
    if (!topicData) return null;

    // Варіант А: Масив "doors" (як у вашій новій структурі)
    if (topicData.doors && Array.isArray(topicData.doors)) {
        return topicData.doors[level - 1]; 
    }
    
    // Варіант Б: Об'єкт "1", "2" (стара структура)
    if (typeof topicData === 'object') {
        return topicData[level] || topicData[String(level)];
    }
    
    return null;
}

export async function sendConfigToUnity(topic, teacherId, studentId, level = 1) {
    console.log(`🚀 GameBridge: Старт... Topic="${topic}", Teacher="${teacherId}", Level=${level}`);

    const iframe = document.getElementById("unity-iframe");
    if (!iframe) {
        console.warn("⚠️ GameBridge: Unity Iframe не знайдено.");
        return;
    }

    let finalConfig = {
        question: `Рівень ${level}: 2 + 2 = ?`, 
        answer: "4",
        wrongAnswers: ["5", "3", "1"],
        time: 120,
        reward: 10,
        hasShield: false,
        hasRadar: false,
        hasExtraTime: false
    };

    // ==========================================
    // 🛡️ ЛОГІКА БУСТЕРІВ (СПИСАННЯ З МАСИВУ)
    // ==========================================
    const selectedBoosterIds = Array.from(document.querySelectorAll('.booster-checkbox:checked'))
                                    .map(cb => cb.value);
    
    if (selectedBoosterIds.length > 0 && studentId) {
        try {
            const studentRef = doc(db, "users", studentId);
            const studentSnap = await getDoc(studentRef);

            if (studentSnap.exists()) {
                const studentData = studentSnap.data();
                // У вас інвентар лежить в profile.inventory
                const inventory = studentData.profile?.inventory || [];
                const toRemove = [];

                selectedBoosterIds.forEach(id => {
                    // Знаходимо ПОВНИЙ об'єкт у масиві, бо arrayRemove видаляє лише при повному збігу
                    const itemObject = inventory.find(i => i.id === id);
                    
                    if (itemObject) {
                        toRemove.push(itemObject);
                        
                        // Вмикаємо прапорці для Unity
                        if (id === 'sys_shield') finalConfig.hasShield = true;
                        if (id === 'sys_radar') finalConfig.hasRadar = true;
                        if (id === 'sys_time') finalConfig.hasExtraTime = true;
                    }
                });

                if (toRemove.length > 0) {
                    await updateDoc(studentRef, {
                        "profile.inventory": arrayRemove(...toRemove)
                    });
                    console.log("💎 Бустери списано з бази:", toRemove.map(i => i.id));
                }
            }
        } catch (e) {
            console.error("❌ Помилка списання бустерів:", e);
            // Зупиняємо запуск, якщо не вдалося списати (захист від накрутки)
            return; 
        }
    }
    // ==========================================

    let foundTask = null;
    try {
        // --- 1. ПЕРЕВІРКА ВЧИТЕЛЯ ---
        if (teacherId) {
            const teacherRef = doc(db, "teacher_configs", teacherId);
            const teacherSnap = await getDoc(teacherRef);
            if (teacherSnap.exists()) {
                const topicData = findTopicCaseInsensitive(teacherSnap.data(), topic);
                if (topicData) {
                    foundTask = getLevelFromTopicData(topicData, level);
                }
            }
        }

        // --- 2. ГЛОБАЛЬНИЙ КОНФІГ ---
        if (!foundTask) {
            const globalRef = doc(db, "global_config", "game_levels");
            const globalSnap = await getDoc(globalRef);
            if (globalSnap.exists()) {
                const topicData = findTopicCaseInsensitive(globalSnap.data(), topic);
                if (topicData) {
                    foundTask = getLevelFromTopicData(topicData, level);
                }
            }
        }

        if (foundTask) {
            finalConfig.question = foundTask.question || "Питання?";
            finalConfig.answer = String(foundTask.answer || "0");
            if (Array.isArray(foundTask.wrongAnswers)) {
                finalConfig.wrongAnswers = foundTask.wrongAnswers.map(String);
            }
            
            finalConfig.time = foundTask.timeLimit ? parseInt(foundTask.timeLimit) : 120;
            
            if (foundTask.reward !== undefined) finalConfig.reward = parseInt(foundTask.reward);
        }
    } catch (err) { console.error(err); }

    // --- 4. ВІДПРАВКА ---
    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload;
    const unityGame = iframe.contentWindow.unityInstance;

    if (unityGame) {
        console.log("✅ Відправка до GameManager:", finalConfig);
        unityGame.SendMessage("GameManager", "AcceptConfig", payload);
    }
}

// Для повторної відправки
window.trySendToUnity = function() { 
    if (!cachedPayload) return;
    const iframe = document.getElementById("unity-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(cachedPayload, "*");
    }
};