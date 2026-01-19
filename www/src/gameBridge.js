import { db } from "./firebase.js"; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let cachedPayload = null; 

export async function sendConfigToUnity(topic, teacherId, studentId, level = 1) {
    console.log(`🚀 GameBridge: Старт... Topic="${topic}", Teacher="${teacherId}", Level=${level}`);

    const iframe = document.getElementById("unity-iframe");
    if (!iframe) {
        console.warn("⚠️ GameBridge: Unity Iframe не знайдено.");
        return;
    }

    // 1. СТАНДАРТНИЙ КОНФІГ (ФОЛБЕК)
    // Це відправиться, якщо в базі нічого немає або сталася помилка
    let finalConfig = {
        question: `Рівень ${level}: 2 + 2 = ?`, // Заглушка
        answer: "4",
        wrongAnswers: ["5", "3", "1"],
        time: 120,
        reward: 10 // Менше золота за дефолтний рівень
    };

    try {
        if (!teacherId) throw new Error("ID вчителя не передано");

        const configRef = doc(db, "teacher_configs", teacherId);
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const data = configSnap.data();
            console.log("📂 Дані з Firebase отримано. Ключі:", Object.keys(data));
            
            // --- ВИПРАВЛЕННЯ 1: ПОШУК ТЕМИ БЕЗ ВРАХУВАННЯ РЕГІСТРУ ---
            // Шукаємо ключ, який схожий на topic (наприклад "quadratics" знайде "Quadratics")
            let topicKey = Object.keys(data).find(k => k.toLowerCase() === topic.toLowerCase());
            
            // Якщо не знайшли в корені, шукаємо в 'topics' (якщо така структура є)
            if (!topicKey && data.topics) {
                 const subKeys = Object.keys(data.topics);
                 const subKey = subKeys.find(k => k.toLowerCase() === topic.toLowerCase());
                 if (subKey) {
                     topicKey = subKey; // Тут треба обережно, далі логіка для кореневого об'єкта, але ідея така
                 }
            }

            if (topicKey) {
                console.log(`✅ Знайдено тему в базі: "${topicKey}" (запит був "${topic}")`);
                const topicData = data[topicKey];

                let foundTask = null; 

                // --- ЛОГІКА ПОШУКУ РІВНЯ ---
                if (topicData.doors && Array.isArray(topicData.doors)) {
                    // Структура масиву (як у твоєму дампі)
                    const idx = level - 1;
                    if (topicData.doors[idx]) {
                        foundTask = topicData.doors[idx];
                    }
                }
                else if (typeof topicData === 'object') {
                    // Структура об'єкта {"1": {...}, "2": {...}}
                    foundTask = topicData[level] || topicData[String(level)];
                }

                // --- ВИПРАВЛЕННЯ 2: ЯКЩО ЗАВДАННЯ ЗНАЙДЕНО ---
                if (foundTask) {
                    console.log(`🎯 Знайдено кастомне завдання для рівня ${level}:`, foundTask);

                    finalConfig.question = foundTask.question || finalConfig.question;
                    finalConfig.answer = String(foundTask.answer || finalConfig.answer);
                    
                    // Обробка неправильних відповідей
                    if (Array.isArray(foundTask.wrongAnswers)) {
                        finalConfig.wrongAnswers = foundTask.wrongAnswers.map(String);
                    } else if (typeof foundTask.wrongAnswers === 'string') {
                        finalConfig.wrongAnswers = foundTask.wrongAnswers.split(',').map(s => s.trim());
                    }

                    // Час і нагорода
                    if (foundTask.timeLimit) finalConfig.time = parseInt(foundTask.timeLimit);
                    if (foundTask.reward) finalConfig.reward = parseInt(foundTask.reward);

                } else {
                    // --- ВАЖЛИВО: ЯКЩО РІВНЯ НЕМАЄ В БАЗІ ---
                    console.warn(`⚠️ У темі "${topicKey}" немає завдання для рівня ${level}. Використовую дефолт.`);
                    finalConfig.question = `Бонусний рівень ${level} (Тема: ${topicKey})`;
                    // Залишаємо answer="4" та інші параметри зі стандартного конфігу,
                    // або можемо згенерувати прості приклади
                }
            } else {
                console.error(`❌ Тему "${topic}" не знайдено у вчителя. Доступні: ${Object.keys(data).join(", ")}`);
                finalConfig.question = `Тема "${topic}" недоступна`;
            }
        } else {
            console.error("❌ Документ вчителя не знайдено.");
        }
    } catch (error) {
        console.error("❌ ERROR GameBridge:", error);
    }

    // Відправка
    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload;
    console.log("📤 Відправка в Unity:", payload);
    
    if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(payload, "*");
    }
}

// Для повторної відправки (якщо Unity завантажився пізніше)
window.trySendToUnity = function() { 
    if (!cachedPayload) return;
    const iframe = document.getElementById("unity-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(cachedPayload, "*");
    }
};