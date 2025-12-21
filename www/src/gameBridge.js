// src/gameBridge.js
import { db } from "./firebase.js";
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let cachedConfig = null; // Зберігаємо конфіг, щоб відправляти повторно

// ==========================================
// 1. ОТРИМАННЯ ДАНИХ З FIREBASE І ВІДПРАВКА
// ==========================================
export async function sendConfigToUnity(topicId, teacherId) {
    console.log(`📥 Завантаження завдань з Firebase: Teacher=${teacherId}, Topic=${topicId}`);

    let doorsData = [];
    let reward = 100;
    let timeLimit = 120;

    try {
        // УВАГА: Тут має бути шлях до вашої колекції завдань.
        // Приклад: users -> {teacherId} -> topics -> {topicId} -> levels
        const q = query(
            collection(db, "users", teacherId, "topics", topicId, "levels"),
            orderBy("levelNumber") // Сортуємо по порядку (якщо є поле levelNumber)
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                doorsData.push({
                    id: Number(data.levelNumber) || Number(doc.id) || 0, // ID рівня (int)
                    question: data.question || "Питання?",
                    answer: data.correctAnswer || "0",
                    wrongAnswers: data.wrongAnswers || ["1", "2", "3"]
                });
            });
            console.log(`✅ Знайдено ${doorsData.length} рівнів.`);
        } else {
            console.warn("⚠️ Завдань у базі немає. Використовую резервні дані.");
            doorsData = [
                { id: 1, question: "Тест 2+2", answer: "4", wrongAnswers: ["1", "5", "0"] },
                { id: 2, question: "Тест 5*5", answer: "25", wrongAnswers: ["20", "30", "15"] }
            ];
        }

    } catch (error) {
        console.error("❌ Помилка Firebase:", error);
    }

    // Формуємо об'єкт для Unity
    const gameConfig = {
        reward: reward,
        timeLimit: timeLimit,
        doors: doorsData
    };

    // Кешуємо конфіг
    cachedConfig = JSON.stringify(gameConfig);

    // Пробуємо відправити
    trySendConfig();
}

// ==========================================
// 2. ВІДПРАВКА ЧЕРЕЗ IFRAME (POST MESSAGE)
// ==========================================
function trySendConfig() {
    if (!cachedConfig) return;

    const iframe = document.querySelector("#unity-container iframe");
    
    if (iframe && iframe.contentWindow) {
        console.log("🚀 Відправка конфігу в Iframe...");
        
        // Шлемо повідомлення у вікно iframe
        iframe.contentWindow.postMessage({ 
            type: "SET_CONFIG", 
            payload: cachedConfig 
        }, "*");
    } else {
        console.warn("⏳ Iframe не знайдено. Чекаємо...");
    }
}