// src/gameBridge.js
import { db } from "./firebase.js";
import { doc, getDoc, updateDoc, increment, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

// ==========================================
// 1. ОТРИМАННЯ ПАРАМЕТРІВ З URL (ДЛЯ IFRAME)
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('teacherId');
const topic = urlParams.get('topic') || 'Fractions';
const currentLevel = urlParams.get('level') || '1';

// ==========================================
// 2. ЗАВАНТАЖЕННЯ ЗАВДАНЬ (UNITY <- FIREBASE)
// ==========================================
async function fetchAndSendConfig() {
    if (!teacherId) {
        console.error("GameBridge: Teacher ID not found in URL!");
        return;
    }

    try {
        // Завантажуємо конфігурацію вчителя
        const configRef = doc(db, "teacher_configs", teacherId);
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const allConfigs = configSnap.data();
            
            // Беремо дані конкретно для цієї теми
            const levelData = allConfigs[topic] || allConfigs;
            
            // Додаємо номер рівня в об'єкт, щоб Unity знала, яку частину лабіринту будувати
            const finalConfig = {
                ...levelData,
                currentLevel: parseInt(currentLevel)
            };

            const jsonStr = JSON.stringify(finalConfig);

            if (window.unityInstance) {
                window.unityInstance.SendMessage('GameManager', 'SetLevelConfig', jsonStr);
                console.log("✅ Завдання відправлено в Unity для рівня:", currentLevel);
            } else {
                // Якщо Unity ще не ініціалізувалася, пробуємо знову через секунду
                setTimeout(fetchAndSendConfig, 1000);
            }
        } else {
            console.warn("Конфігурація вчителя не знайдена, використовуються стандартні налаштування Unity.");
        }
    } catch (error) {
        console.error("❌ Помилка завантаження конфігу:", error);
    }
}

// Робимо функцію доступною для виклику з Unity (DataManager.cs)
window.RequestGameConfigFromFirebase = function() {
    fetchAndSendConfig();
};

// ==========================================
// 3. ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТІВ (UNITY -> SITE)
// ==========================================
// Цей слухач ловить повідомлення від Unity
window.addEventListener("message", async (event) => {
    // Unity шле JSON-рядок, його треба розпарсити
    let data;
    try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) { return; }

    if (data.type === "LEVEL_COMPLETE") {
        try {
            const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
            const user = getCurrentUser();

            if (!user) {
                console.error("Користувач не авторизований!");
                return;
            }

            console.log("🏆 Зберігаємо результат гри:", payload);

            // 1. Оновлення профілю (Золото + Максимальний рівень)
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                "profile.gold": increment(payload.score),
                "profile.progress.maxLevel": increment(1) // Відкриваємо наступний рівень
            });

            // 2. Запис в історію для вчителя
            await addDoc(collection(db, "game_results"), {
                userId: user.uid,
                teacherUid: teacherId, // Беремо з URL, бо це надійніше
                userName: user.name,
                topic: topic,
                level: payload.level || currentLevel,
                grade: payload.grade,
                goldEarned: payload.score,
                timestamp: serverTimestamp()
            });

            console.log("✅ Результат успішно синхронізовано з Firebase!");
            
            // Після успішного збереження можна закрити гру через 2 секунди
            setTimeout(() => {
                if (window.parent.closeUnityGame) window.parent.closeUnityGame();
            }, 2000);

        } catch (error) {
            console.error("❌ Помилка збереження результату:", error);
        }
    }
});