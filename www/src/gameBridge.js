// src/gameBridge.js
import { db } from "./firebase.js";
import { 
    doc, 
    getDoc, 
    updateDoc, 
    increment, 
    addDoc, 
    collection, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

// Змінні стану гри
let activeTopic = "Fractions";
let activeTeacherId = null;

// ==========================================
// 1. ФУНКЦІЯ ВІДПРАВКИ КОНФІГУРАЦІЇ (Викликається з router.js)
// ==========================================
export async function sendConfigToUnity(topicName, teacherId) {
    // Зберігаємо в змінні, щоб використати при збереженні результатів
    activeTopic = topicName;
    activeTeacherId = teacherId;

    if (!teacherId) {
        console.error("❌ GameBridge: Teacher ID не передано!");
        return;
    }

    console.log(`📡 GameBridge: Завантаження теми "${topicName}" для вчителя: ${teacherId}`);
    
    try {
        const teacherConfigRef = doc(db, "teacher_configs", teacherId);
        const docSnap = await getDoc(teacherConfigRef);

        if (docSnap.exists()) {
            const configData = docSnap.data();
            const topicConfig = configData[topicName];

            if (topicConfig) {
                // Додаємо технічні дані, якщо треба
                const finalConfig = {
                    ...topicConfig,
                    currentLevel: 1 // Поки що стартуємо з 1, або можна брати з профілю учня
                };

                const jsonStr = JSON.stringify(finalConfig);
                
                // Шукаємо Unity (або в iframe, або в тому ж вікні)
                const iframe = document.querySelector("#unity-container iframe");
                const targetInstance = window.unityInstance || iframe?.contentWindow?.unityInstance;

                if (targetInstance) {
                    targetInstance.SendMessage('GameManager', 'SetLevelConfig', jsonStr);
                    console.log("🚀 GameBridge: Дані успішно відправлені в Unity!");
                } else {
                    console.warn("⚠️ GameBridge: Unity ще не готова. Чекаємо...");
                    // Спробувати ще раз через 0.5 сек (максимум 5 разів можна додати лічильник)
                    setTimeout(() => sendConfigToUnity(topicName, teacherId), 500);
                }
            } else {
                console.warn(`⚠️ Тема ${topicName} відсутня у конфігурації вчителя.`);
            }
        }
    } catch (error) {
        console.error("❌ Помилка Firebase:", error);
    }
}

// ==========================================
// 2. ОБРОБКА РЕЗУЛЬТАТІВ (Експортуємо для router.js)
// ==========================================
export async function handleGameMessage(event) {
    const data = event.data;
    if (!data) return;

    // Фільтруємо системні повідомлення React/Webpack, якщо вони є
    if (data.source && data.source.startsWith("react")) return;

    const type = (typeof data === 'string') ? data : data.type;

    // --- А) Запит конфігурації від Unity ---
    if (type === "RequestConfigFromJS" || type === "UNITY_READY") {
        console.log("🎮 Unity просить конфіг. Відправляємо...");
        if (activeTeacherId) {
            await sendConfigToUnity(activeTopic, activeTeacherId);
        }
        return;
    }

    // --- Б) Закриття гри ---
    if (type === "CLOSE_GAME") {
        console.log("🚪 Закриття гри");
        const container = document.getElementById("unity-container");
        if (container) container.classList.add("hidden");
        // Тут можна додати оновлення UI
        return;
    }

    // --- В) Результати рівня ---
    if (type === "LEVEL_COMPLETE") {
        console.log("🏆 Рівень пройдено!");
        
        // Парсинг
        let resultData = null;
        if (data.payload) {
            resultData = (typeof data.payload === 'string') ? JSON.parse(data.payload) : data.payload;
        } else if (typeof data === "string" && data.includes("|")) {
             try { resultData = JSON.parse(data.split("|")[1]); } catch(e){}
        } else {
            resultData = data; // Якщо це вже об'єкт
        }

        if (resultData) {
            await saveGameResult(resultData);
        }
    }
}

// Внутрішня функція збереження
async function saveGameResult(resultData) {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const goldToEarn = Number(resultData.score || resultData.goldEarned || 0);
        console.log(`💰 Нарахування золота: ${goldToEarn}`);

        // 1. Оновлюємо баланс
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { 
            "profile.gold": increment(goldToEarn) 
            // Тут можна додати логіку відкриття рівнів: "profile.maxLevel": ...
        });

        // 2. Пишемо історію
        await addDoc(collection(db, "users", user.uid, "game_history"), {
            topic: activeTopic,
            level: Number(resultData.level) || 1,
            grade: Number(resultData.stars || resultData.grade) || 0,
            goldEarned: goldToEarn,
            teacherId: activeTeacherId, // Щоб знати, за чиїм конфігом грав
            timestamp: serverTimestamp()
        });

        console.log("✅ Дані збережено в Firebase");
        
        // Оновлюємо відображення золота на екрані (знаходимо елемент)
        const goldDisplay = document.getElementById("student-gold-display");
        if(goldDisplay) {
            const currentGold = parseInt(goldDisplay.innerText || "0");
            goldDisplay.innerText = currentGold + goldToEarn;
        }

    } catch (e) {
        console.error("❌ Помилка збереження результатів:", e);
    }
}