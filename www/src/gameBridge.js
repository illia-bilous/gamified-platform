import { db } from "./firebase.js"; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    // --- 0. БАЗОВА ЗАГЛУШКА (Safety Net) ---
    // Використовується тільки якщо Firestore впав або глобальний конфіг видалено
    let finalConfig = {
        question: `Рівень ${level}: 2 + 2 = ?`, 
        answer: "4",
        wrongAnswers: ["5", "3", "1"],
        time: 120,
        reward: 10 
    };

    let foundTask = null; // Тут будемо зберігати знайдене завдання
    let source = "Local Fallback"; // Для логів

    try {
        // --- 1. ПЕРЕВІРКА ВЧИТЕЛЯ (Teacher Config) ---
        if (teacherId) {
            const teacherRef = doc(db, "teacher_configs", teacherId);
            const teacherSnap = await getDoc(teacherRef);

            if (teacherSnap.exists()) {
                const teacherData = teacherSnap.data();
                const topicData = findTopicCaseInsensitive(teacherData, topic);
                
                if (topicData) {
                    foundTask = getLevelFromTopicData(topicData, level);
                    if (foundTask) source = "Teacher Config";
                }
            }
        }

        // --- 2. ПЕРЕВІРКА ГЛОБАЛЬНОГО КОНФІГУ (Global Config) ---
        // Виконується ТІЛЬКИ якщо завдання ще не знайдено
        if (!foundTask) {
            console.log(`⚠️ У вчителя немає рівня ${level} для ${topic}. Шукаємо в Global Config...`);
            
            const globalRef = doc(db, "global_config", "game_levels");
            const globalSnap = await getDoc(globalRef);

            if (globalSnap.exists()) {
                const globalData = globalSnap.data();
                const topicData = findTopicCaseInsensitive(globalData, topic);
                
                if (topicData) {
                    foundTask = getLevelFromTopicData(topicData, level);
                    if (foundTask) source = "Global Config";
                }
            } else {
                console.error("❌ Global Config (game_levels) не знайдено в Firestore!");
            }
        }

        // --- 3. ФОРМУВАННЯ ФІНАЛЬНОГО ОБ'ЄКТА ---
        if (foundTask) {
            console.log(`🎯 Завдання знайдено! Джерело: [${source}]`, foundTask);

            finalConfig.question = foundTask.question || "Питання?";
            finalConfig.answer = String(foundTask.answer || "0");
            
            // Обробка неправильних відповідей
            if (Array.isArray(foundTask.wrongAnswers)) {
                finalConfig.wrongAnswers = foundTask.wrongAnswers.map(String);
            } else if (typeof foundTask.wrongAnswers === 'string') {
                finalConfig.wrongAnswers = foundTask.wrongAnswers.split(',').map(s => s.trim());
            }

            // Час і нагорода (безпечне перетворення)
            if (foundTask.timeLimit !== undefined) finalConfig.time = parseInt(foundTask.timeLimit);
            if (foundTask.reward !== undefined) finalConfig.reward = parseInt(foundTask.reward);
        
        } else {
            console.warn(`❌ Завдання не знайдено ні у вчителя, ні глобально. Використовую заглушку.`);
            finalConfig.question = `Тема "${topic}" (Рівень ${level}) недоступна`;
        }

    } catch (error) {
        console.error("❌ ERROR GameBridge:", error);
    }

    // --- 4. ВІДПРАВКА ---
    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload;
    
    console.log(`📤 Відправка в Unity (${source}):`, payload);
    
    if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(payload, "*");
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