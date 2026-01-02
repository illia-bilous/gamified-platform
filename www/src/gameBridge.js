import { db } from "./firebase.js"; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let cachedPayload = null; 

// ==========================================
// 1. ОТРИМАННЯ ДАНИХ ТА ВІДПРАВКА
// ==========================================
export async function sendConfigToUnity(topic, teacherId, studentId, level = 1) {
    console.log(`📥 GameBridge: Завантаження... Teacher=${teacherId}, Topic=${topic}, Level=${level}`);

    const iframe = document.getElementById("unity-iframe");
    if (!iframe || !iframe.contentWindow) {
        console.error("❌ GameBridge: Unity Iframe не знайдено!");
        return;
    }

    // Базовий конфіг
    let finalConfig = {
        reward: 50,     // Глобальний фоллбек
        timeLimit: 300, // Глобальний фоллбек
        doors: [],      // Сюди ми покладемо наші дані
        topic: topic,
        level: level,
        teacherId: teacherId,
        studentId: studentId
    };

    try {
        const configRef = doc(db, "teacher_configs", teacherId);
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const data = configSnap.data();
            
            // 1. Шукаємо тему
            let topicData = data[topic]; 
            if (!topicData && data.topics) {
                topicData = data.topics[topic];
            }

            if (topicData) {
                console.log(`📂 Дані теми знайдено. Структура:`, topicData);
                
                let foundDoors = []; // Тимчасова змінна для дверей

                // =========================================================
                // 🔍 ЛОГІКА ВИЗНАЧЕННЯ СТРУКТУРИ (Виправлена)
                // =========================================================

                // ВАРІАНТ 1: Класичний (всередині теми є масив "doors") -> Це твій "Fractions"
                if (topicData.doors && Array.isArray(topicData.doors)) {
                    console.log("✅ Тип: Standard 'doors' array");
                    // Ми беремо ВЕСЬ масив, бо C# сам знайде потрібний ID всередині
                    foundDoors = topicData.doors; 
                }
                
                // ВАРІАНТ 2: Сама тема є масивом рівнів [Level1, Level2]
                else if (Array.isArray(topicData)) {
                    console.log("✅ Тип: Array of levels");
                    const idx = level - 1;
                    if (topicData[idx]) {
                        // 🔥 ВАЖЛИВО: Загортаємо один рівень в масив, щоб C# його з'їв
                        foundDoors = [ topicData[idx] ]; 
                    }
                }
                
                // ВАРІАНТ 3: Сама тема є об'єктом рівнів {"1": {...}, "2": {...}}
                else if (typeof topicData === 'object') {
                    console.log("✅ Тип: Object map");
                    let specificLevel = topicData[level] || topicData[String(level)];
                    if (specificLevel) {
                         // 🔥 ВАЖЛИВО: Загортаємо один рівень в масив
                        foundDoors = [ specificLevel ];
                    }
                }

                // =========================================================
                // 📤 ФОРМУВАННЯ ФІНАЛЬНОГО ОБ'ЄКТА
                // =========================================================
                
                // Якщо ми знайшли двері (або одну, або список)
                if (foundDoors.length > 0) {
                    finalConfig.doors = foundDoors;
                    
                    // Спробуємо витягнути глобальні налаштування теми, якщо вони є
                    if (topicData.reward) finalConfig.reward = parseInt(topicData.reward);
                    if (topicData.timeLimit) finalConfig.timeLimit = parseInt(topicData.timeLimit);
                    
                    console.log(`🎯 УСПІХ! Відправляємо дверей: ${finalConfig.doors.length}`);
                    
                    // Лог для перевірки, чи є reward всередині дверей
                    const targetDoor = finalConfig.doors.find(d => d.id == level);
                    if(targetDoor) {
                        console.log(`🧐 Перевірка для рівня ${level}: Reward=${targetDoor.reward}, Time=${targetDoor.timeLimit}`);
                    }
                } else {
                    console.warn(`⚠️ Рівень ${level} не знайдено в темі!`);
                }

            } else {
                console.warn(`⚠️ Тему '${topic}' не знайдено.`);
            }
        }
    } catch (error) {
        console.error("❌ ERROR Config:", error);
    }

    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload; // Зберігаємо для ретраю

    console.log("📤 Sending JSON to Unity:", payload);
    
    iframe.contentWindow.postMessage({ 
        type: "CONFIG_RESPONSE", 
        payload: payload 
    }, "*");
}

// Функція для повторної відправки (якщо Unity завантажилась пізніше)
window.trySendToUnity = function() { // Робимо доступною глобально про всяк випадок
    if (!cachedPayload) return;
    let unityFrame = document.getElementById("unity-iframe");
    if (unityFrame && unityFrame.contentWindow) {
        unityFrame.contentWindow.postMessage({ 
            type: "CONFIG_RESPONSE", 
            payload: cachedPayload 
        }, "*");
    }
};