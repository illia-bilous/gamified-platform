import { db } from "./firebase.js"; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let cachedPayload = null; 

// ==========================================
// 1. ОТРИМАННЯ ДАНИХ ТА ВІДПРАВКА
// ==========================================
export async function sendConfigToUnity(topic, teacherId, studentId, level = 1) {
    console.log(`📥 GameBridge: Завантаження... Teacher=${teacherId}, Topic=${topic}, Level=${level}`);

    const iframe = document.getElementById("unity-iframe");
    // Якщо iframe ще не створено (наприклад, гра не відкрита)
    if (!iframe) {
        console.warn("⚠️ GameBridge: Unity Iframe не знайдено (гра закрита?).");
        return;
    }

    // Базовий конфіг (якщо в базі нічого немає)
    let finalConfig = {
        reward: 50,     
        timeLimit: 300, 
        doors: [],      
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
                
                let foundDoors = []; 

                // =========================================================
                // 🔍 ЛОГІКА ВИЗНАЧЕННЯ СТРУКТУРИ
                // =========================================================

                // ВАРІАНТ 1: Класичний (всередині теми є масив "doors")
                if (topicData.doors && Array.isArray(topicData.doors)) {
                    // Беремо весь масив, Unity саме знайде потрібний ID
                    foundDoors = topicData.doors; 
                }
                
                // ВАРІАНТ 2: Сама тема є масивом рівнів [Level1, Level2]
                else if (Array.isArray(topicData)) {
                    const idx = level - 1;
                    if (topicData[idx]) {
                        foundDoors = [ topicData[idx] ]; 
                    }
                }
                
                // ВАРІАНТ 3: Сама тема є об'єктом рівнів {"1": {...}, "2": {...}}
                else if (typeof topicData === 'object') {
                    let specificLevel = topicData[level] || topicData[String(level)];
                    if (specificLevel) {
                        foundDoors = [ specificLevel ];
                    }
                }

                // =========================================================
                // 📤 ФОРМУВАННЯ ФІНАЛЬНОГО ОБ'ЄКТА
                // =========================================================
                
                if (foundDoors.length > 0) {
                    finalConfig.doors = foundDoors;
                    
                    // Глобальні налаштування теми
                    if (topicData.reward) finalConfig.reward = parseInt(topicData.reward);
                    if (topicData.timeLimit) finalConfig.timeLimit = parseInt(topicData.timeLimit);
                    
                    console.log(`🎯 УСПІХ! Знайдено конфіг для рівня ${level}`);
                } else {
                    console.warn(`⚠️ Рівень ${level} не знайдено в темі! Використовую дефолт.`);
                }
            } else {
                console.warn(`⚠️ Тему '${topic}' не знайдено.`);
            }
        }
    } catch (error) {
        console.error("❌ ERROR Config:", error);
    }

    // Серіалізація в JSON
    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload; // Кешуємо для retry

    console.log("📤 Sending Config to Unity:", payload);
    
    // =========================================================
    // 🔥 ВІДПРАВКА В UNITY (НАДІЙНИЙ СПОСІБ)
    // =========================================================
    
    // 1. Спроба прямого виклику (якщо unityInstance доступний глобально)
    if (window.unityInstance) {
        window.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', payload);
    } 
    // 2. Спроба виклику через contentWindow iframe (найчастіший випадок)
    else if (iframe.contentWindow && iframe.contentWindow.unityInstance) {
        iframe.contentWindow.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', payload);
    } 
    // 3. Fallback: postMessage (якщо Unity ще вантажиться або використовує слухач подій в index.html)
    else if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(payload, "*");
    }
}

// Функція повторної відправки (якщо Unity попросила конфіг пізніше)
window.trySendToUnity = function() { 
    if (!cachedPayload) return;
    console.log("🔄 Retry sending config...");
    
    const iframe = document.getElementById("unity-iframe");
    if (!iframe) return;

    if (window.unityInstance) {
        window.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', cachedPayload);
    } else if (iframe.contentWindow && iframe.contentWindow.unityInstance) {
        iframe.contentWindow.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', cachedPayload);
    } else {
        iframe.contentWindow.postMessage(cachedPayload, "*");
    }
};