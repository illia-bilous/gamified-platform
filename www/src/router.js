// src/router.js
import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser } from "./auth.js";
import { initStudentPanel } from "./studentPanel.js";
import { initTeacherPanel } from "./teacherPanel.js"; 
import { loadTeacherAnalytics } from "./analytics.js";

// Імпорти Firebase
import { db } from "./firebase.js";
import { 
    doc, 
    getDoc,
    getDocs,
    updateDoc, 
    increment, 
    collection, 
    addDoc, 
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentRole = null;

// =========================================================
// 🚀 ЛОГІКА UNITY (ЗВ'ЯЗОК З ГРОЮ)
// =========================================================

// 1. Функція відправки конфігурації в Unity
window.sendConfigToUnity = async (topicName) => {
    const user = getCurrentUser();
    const teacherId = user?.teacherUid || user?.profile?.teacherUid; 

    if (!teacherId) {
        console.error("❌ Teacher ID не знайдено. Відміна запиту.");
        return;
    }

    console.log(`📡 Завантаження теми "${topicName}" для вчителя: ${teacherId}`);
    
    try {
        const teacherConfigRef = doc(db, "teacher_configs", teacherId);
        const docSnap = await getDoc(teacherConfigRef);

        if (docSnap.exists()) {
            const configData = docSnap.data();
            const topicConfig = configData[topicName];

            if (topicConfig) {
                const jsonStr = JSON.stringify(topicConfig);
                
                // --- КРИТИЧНЕ ВИПРАВЛЕННЯ ТУТ ---
                // Шукаємо спочатку в головному вікні, потім в iframe
                const iframe = document.querySelector("#unity-container iframe");
                const targetInstance = window.unityInstance || iframe?.contentWindow?.unityInstance;

                if (targetInstance) {
                    targetInstance.SendMessage('GameManager', 'SetLevelConfig', jsonStr);
                    console.log("🚀 Дані відправлені в Unity!");
                } else {
                    console.error("❌ unityInstance не знайдено! Перевірте index.html всередині папки unity.");
                }
            }
        }
    } catch (error) {
        console.error("❌ Помилка Firebase:", error);
    }
};

// 2. Слухач повідомлень (Місток між JS та Unity .jslib)
// ВСТАВТЕ ЦЕ У router.js ЗАМІСТЬ СТАРОГО window.addEventListener("message", ...)
window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data) return;

    // 1. Логуємо ВСЕ, що приходить, щоб зрозуміти формат
    console.log("📥 Router отримав повідомлення:", data);

    // 2. Визначаємо тип повідомлення (враховуємо і рядки, і об'єкти)
    const type = (typeof data === 'string') ? data : data.type;

    // --- А) Запит конфігурації ---
    if (type === "RequestConfigFromJS" || type === "UNITY_READY") {
        console.log("🎯 ПІДТВЕРДЖЕНО: Обробка запиту конфігурації...");
        
        // Визначаємо тему (якщо це об'єкт, беремо з нього, інакше Fractions)
        const topic = data.topic || "Fractions";
        
        // Робимо паузу 300мс, щоб Unity встигла ініціалізувати свій GameManager
        setTimeout(async () => {
            if (window.sendConfigToUnity) {
                await window.sendConfigToUnity(topic);
            } else {
                console.error("❌ Помилка: window.sendConfigToUnity не визначена!");
            }
        }, 300);
        return;
    }

    // --- Б) Закриття гри ---
    if (type === "CLOSE_GAME") {
        console.log("🚪 Закриття гри...");
        if (window.closeUnityGame) window.closeUnityGame();
        return;
    }

    // --- В) Результати рівня (LEVEL_COMPLETE) ---
    if (type === "LEVEL_COMPLETE" || (typeof data === 'string' && data.startsWith("LEVEL_COMPLETE"))) {
        console.log("🏆 Отримано результати рівня!");
        
        let resultData = null;
        if (typeof data === "string" && data.includes("|")) {
            try {
                resultData = JSON.parse(data.split("|")[1]);
            } catch(e) { console.error("Помилка парсингу результатів:", e); }
        } else {
            resultData = data.payload ? JSON.parse(data.payload) : data;
        }

        if (resultData) {
            handleGameResult(resultData); // Винесіть логіку Firebase в окрему функцію для чистоти
        }
    }
});

// Допоміжна функція для Firebase (щоб не захаращувати обробник подій)
async function handleGameResult(resultData) {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
        const goldToEarn = Number(resultData.score || resultData.goldEarned || 0);
        console.log(`💰 Нарахування золота: ${goldToEarn}`);
        
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { "profile.gold": increment(goldToEarn) });
        
        await addDoc(collection(db, "users", user.uid, "game_history"), {
            topic: resultData.topic || "Fractions",
            level: Number(resultData.level) || 1,
            grade: Number(resultData.stars || resultData.grade) || 0,
            goldEarned: goldToEarn,
            timestamp: serverTimestamp()
        });
        console.log("✅ Дані збережено в Firebase");
    } catch (e) {
        console.error("❌ Помилка збереження результатів:", e);
    }
}
// =========================================================
// 🛠 СЛУЖБОВІ ФУНКЦІЇ (АВТОРИЗАЦІЯ, UI, РЕМОНТ)
// =========================================================

function initializeApp() {
    console.log("initializeApp: Start...");

    // Навігація ролей
    setupButtonListener("btn-role-student", () => { 
        currentRole = "student"; 
        localStorage.setItem("selectedRole", "student");
        showScreen("screen-auth-choice"); 
        setTimeout(resetForms, 50);
    });
    
    setupButtonListener("btn-role-teacher", () => { 
        currentRole = "teacher"; 
        localStorage.setItem("selectedRole", "teacher");
        showScreen("screen-auth-choice"); 
        setTimeout(resetForms, 50);
    });

    setupButtonListener("btn-back-to-home", () => showScreen("screen-home"));
    setupButtonListener("btn-login", () => showScreen("screen-login"));
    setupButtonListener("btn-register", () => {
        showScreen("screen-register");
        updateRegisterView();
    });

    setupButtonListener("logout-student", logout);
    setupButtonListener("logout-teacher", logout);

    // Вхід в панелі
    const handleLoginSuccess = async (role) => {
        if (role === "student") {
            showScreen("screen-student");
            await initStudentPanel(); // Спочатку ініціалізація
            setupDashboardNavigation("screen-student"); // Потім навігація
        } else {
            showScreen("screen-teacher");
            await initTeacherPanel(); // ВАЖЛИВО: дочекатися побудови DOM вчителя
            setupDashboardNavigation("screen-teacher");
        }
    };

    initAuth(handleLoginSuccess);

    const user = getCurrentUser();
    if (user) {
        handleLoginSuccess(user.role);
    } else {
        showScreen("screen-home");
    }
}

// Функція виправлення "битого" золота (NaN)
async function fixBrokenGold() {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        snapshot.forEach(async (userDoc) => {
            const data = userDoc.data();
            if (data.profile && (isNaN(data.profile.gold) || data.profile.gold === null)) {
                await updateDoc(doc(db, "users", userDoc.id), { "profile.gold": 0 });
            }
        });
    } catch (e) { console.error("Fix gold error:", e); }
}

// Допоміжні функції UI
function setupButtonListener(id, handler) {
    const btn = document.getElementById(id);
    if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", handler);
    }
}

const logout = () => {
    localStorage.removeItem("currentUser");
    location.hash = "";
    showScreen("screen-home");
};

function resetForms() {
    document.querySelectorAll("form").forEach(f => f.reset());
}

function updateRegisterView() {
    const role = localStorage.getItem("selectedRole");
    const isStudent = role === "student";
    
    document.getElementById("email-field-group")?.toggleAttribute("hidden", isStudent);
    document.getElementById("select-class-wrapper")?.classList.toggle("hidden", !isStudent);
    document.getElementById("student-teacher-id-block")?.classList.toggle("hidden", !isStudent);
    
    const regTitle = document.querySelector("#screen-register h2");
    if (regTitle) regTitle.innerText = isStudent ? "Реєстрація Учня" : "Реєстрація Вчителя";
}

function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;
    
    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    
    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
            
            // 1. Видаляємо active у кнопок
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 2. Ховаємо всі панелі
            container.querySelectorAll('.panel-view').forEach(view => {
                view.classList.add('hidden');
                view.classList.remove('active');
            });

            // 3. Показуємо потрібну
            const targetView = document.getElementById(`view-${panelName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            // 4. Спеціальні виклики
            if (panelName === 'analytics') {
                const user = getCurrentUser();
                if (user?.role === 'teacher') loadTeacherAnalytics(user.uid);
            }
        };
    });
}

// Запуск
initializeApp();
setTimeout(fixBrokenGold, 3000);