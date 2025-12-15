import { db } from "./firebase.js";
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

window.addEventListener("message", async (event) => {
    if (event.data.type === "LEVEL_COMPLETE") {
        try {
            // Розбираємо JSON від Unity
            const payload = JSON.parse(event.data.payload);
            const user = getCurrentUser();

            if (!user) return;

            console.log("Отримано дані гри:", payload);

            // 1. Оновлюємо золото користувача
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                gold: increment(payload.score)
            });

            // 2. Оновлюємо інтерфейс (якщо ми на сторінці студента)
            const goldDisplay = document.getElementById("student-gold-display");
            if (goldDisplay) {
                let current = parseInt(goldDisplay.innerText) || 0;
                goldDisplay.innerText = current + payload.score;
            }

            // 3. ЗБЕРІГАЄМО В ІСТОРІЮ (для таблиці вчителя)
            // Колекція "game_results" дозволяє легко шукати всі ігри
            await addDoc(collection(db, "game_results"), {
                userId: user.uid,
                userName: user.name, // Для зручності
                topic: payload.topic,
                level: payload.level,
                grade: payload.grade, // Оцінка 1-12
                score: payload.score, // Золото
                time: payload.time,   // Час
                timestamp: serverTimestamp()
            });

            console.log("Результат збережено успішно!");

        } catch (error) {
            console.error("Помилка обробки результату гри:", error);
        }
    }
});