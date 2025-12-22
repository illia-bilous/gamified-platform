// src/gameBridge.js
import { db } from "./firebase.js"; // Перевір, що шлях правильний
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let cachedConfig = null;

// ==========================================
// 1. ОТРИМАННЯ ДАНИХ (Вчитель -> Глобальні -> Запасні)
// ==========================================
export async function sendConfigToUnity(topicId, teacherId) {
    console.log(`📥 Завантаження рівня: Teacher=${teacherId}, Topic=${topicId}`);

    let gameConfig = null;

    // ---------------------------------------------------------
    // ЕТАП 1: Шукаємо особистий конфіг вчителя
    // ---------------------------------------------------------
    if (teacherId) {
        try {
            // Шукаємо документ, де ID = UID вчителя
            const teacherRef = doc(db, "teacher_configs", teacherId);
            const snapshot = await getDoc(teacherRef);

            if (snapshot.exists()) {
                const data = snapshot.data();
                console.log(`📂 У вчителя знайдено теми:`, Object.keys(data)); // 👈 ДУЖЕ КОРИСНИЙ ЛОГ

                // Перевіряємо точний збіг (Fractions == Fractions)
                if (data[topicId]) {
                    console.log(`✅ Знайдено персональний рівень вчителя для "${topicId}"!`);
                    gameConfig = data[topicId];
                } else {
                    console.warn(`⚠️ Вчитель існує, але теми "${topicId}" немає. Доступні: ${Object.keys(data).join(", ")}`);
                }
            } else {
                console.warn(`⚠️ Документ вчителя (ID: ${teacherId}) не знайдено в teacher_configs.`);
            }
        } catch (e) {
            console.error("❌ Помилка читання вчителя:", e);
        }
    }

    // ---------------------------------------------------------
    // ЕТАП 2: Якщо у вчителя пусто -> ГЛОБАЛЬНИЙ КОНФІГ
    // ---------------------------------------------------------
    if (!gameConfig) {
        console.log("🔄 Перемикаємось на пошук глобального шаблону...");
        try {
            const globalRef = doc(db, "global_config", "game_levels");
            const globalSnap = await getDoc(globalRef);

            if (globalSnap.exists()) {
                const gData = globalSnap.data();
                if (gData[topicId]) {
                    console.log("✅ Завантажено ГЛОБАЛЬНИЙ рівень.");
                    gameConfig = gData[topicId];
                } else {
                    console.warn(`⚠️ Глобальний рівень для "${topicId}" теж відсутній.`);
                }
            }
        } catch (e) {
            console.error("❌ Помилка глобального конфігу:", e);
        }
    }

    // ---------------------------------------------------------
    // ЕТАП 3: Якщо все пропало -> Хардкод (FALLBACK)
    // ---------------------------------------------------------
    if (!gameConfig) {
        console.warn("⚠️ База пуста або помилка. Використовую аварійні дані з коду.");
        gameConfig = {
            reward: 50,
            timeLimit: 300,
            doors: [
                { id: 1, question: "2 + 2 = ?", answer: "4", wrongAnswers: ["5", "1", "0"] },
                { id: 2, question: "10 - 3 = ?", answer: "7", wrongAnswers: ["6", "8", "1"] }
            ]
        };
    }

    // Кешуємо і відправляємо
    cachedConfig = JSON.stringify(gameConfig);
    trySendConfig();
}

// ==========================================
// 2. ВІДПРАВКА В UNITY
// ==========================================
function trySendConfig() {
    if (!cachedConfig) return;

    const iframe = document.querySelector("#unity-container iframe"); // Перевір, чи ID контейнера правильний
    if (iframe && iframe.contentWindow) {
        // console.log("🚀 Sending config to Unity...");
        iframe.contentWindow.postMessage({ 
            type: "SET_CONFIG", 
            payload: cachedConfig 
        }, "*");
    } else {
        setTimeout(trySendConfig, 1000);
    }
}