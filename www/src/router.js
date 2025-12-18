// src/router.js
import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser } from "./auth.js";
import { initStudentPanel } from "./studentPanel.js";
import { initTeacherPanel } from "./teacherPanel.js"; 

import { loadTeacherAnalytics } from "./analytics.js";
//  НОВІ ІМПОРТИ ДЛЯ UNITY ТА FIREBASE (Всі разом в одному місці!)
import { db } from "./firebase.js";
import { 
    doc, 
    updateDoc, 
    increment, 
    collection, 
    addDoc, 
    serverTimestamp,
    query,       // <--- Додано з нижнього блоку
    where,       // <--- Додано з нижнього блоку
    getDocs,     // <--- Додано з нижнього блоку
    orderBy,      // <--- Додано з нижнього блоку
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentRole = null;

const logout = () => {
    localStorage.removeItem("currentUser");
    currentRole = null;
    location.hash = "";
    resetForms();
    showScreen("screen-home");
};


function setupButtonListener(id, handler) {
    const btn = document.getElementById(id);
    if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", handler);
    }
}

function resetForms() {
    console.log("🧹 Cleaning forms...");
    const forms = ["login-form", "register-form"];

    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
            form.querySelectorAll("input, select").forEach(el => {
                el.value = "";
                el.classList.remove("input-error");
            });
            form.querySelectorAll("select").forEach(s => s.selectedIndex = 0);
        }
    });

    document.querySelectorAll(".error-msg").forEach(el => el.remove());
    document.getElementById("register-form-content")?.classList.remove("hidden");
    document.getElementById("register-success")?.classList.add("hidden");
}

function updateRegisterView() {
    const role = localStorage.getItem("selectedRole"); 
    console.log("Налаштування форми для ролі:", role);

    const emailGroup = document.getElementById("email-field-group");
    const classWrapper = document.getElementById("select-class-wrapper");
    const teacherKeyDiv = document.getElementById("register-teacher-key");
    const regTitle = document.querySelector("#screen-register h2");
    const studentTeacherIdBlock = document.getElementById("student-teacher-id-block");

    if (role === "student") {
        if(regTitle) regTitle.innerText = "Реєстрація Учня";
        if(emailGroup) emailGroup.style.display = "none";
        if(classWrapper) classWrapper.classList.remove("hidden");
        if(teacherKeyDiv) teacherKeyDiv.classList.add("hidden");
        if(studentTeacherIdBlock) studentTeacherIdBlock.classList.remove("hidden");

        const emailInput = document.getElementById("reg-email");
        if(emailInput) emailInput.removeAttribute("required");

    } else {
        if(regTitle) regTitle.innerText = "Реєстрація Вчителя";
        if(emailGroup) emailGroup.style.display = "block"; 
        if(classWrapper) classWrapper.classList.add("hidden");
        if(teacherKeyDiv) teacherKeyDiv.classList.remove("hidden");
        if(studentTeacherIdBlock) studentTeacherIdBlock.classList.add("hidden");

        const emailInput = document.getElementById("reg-email");
        if(emailInput) emailInput.setAttribute("required", "true");
    }
}

function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;

    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    const views = container.querySelectorAll('.panel-view');

    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
            
            // UI перемикання
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            views.forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });
            
            const targetView = document.getElementById(`view-${panelName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            // 🔥 ЛОГІКА ЗАВАНТАЖЕННЯ ДАНИХ (HOOK)
            if (panelName === 'analytics') {
                const user = getCurrentUser();
                // Перевіряємо, чи це вчитель, щоб не викликати помилку
                if (user && user.role === 'teacher') {
                    loadTeacherAnalytics(user.uid);
                }
            }
        };
    });
}

// =========================================================
// 🔥 ОБРОБКА ПОВІДОМЛЕНЬ ВІД UNITY (АНАЛІТИКА)
// =========================================================
window.addEventListener("message", async (event) => {
    // 1. Перевірка типу даних
    if (typeof event.data !== "string") return;

    // 2. Закриття гри
    if (event.data === "CLOSE_GAME") {
        document.getElementById("unity-container").classList.add("hidden");
        // Якщо треба показати меню:
        // const menu = document.getElementById("view-menu"); // Або ваша логіка показу меню
        // if(menu) menu.classList.remove("hidden");
        return;
    }

    // 3. Обробка результатів рівня
    if (event.data.startsWith("LEVEL_COMPLETE|")) {
        const jsonStr = event.data.split("|")[1];
        
        try {
            const data = JSON.parse(jsonStr); 
            // data = { score: 100, stars: 10, level: 1, topic: "Fractions" }

            const user = getCurrentUser();
            if (!user) {
                console.warn("⚠️ Користувач не авторизований, результати не збережено.");
                return;
            }

            console.log("📥 Отримано результати від Unity:", data);

            // А) Нараховуємо золото
            const userRef = doc(db, "users", user.uid);

            // ГАРАНТУЄМО, що це число. Якщо прийде сміття, запишемо 0.
            const scoreAmount = Number(data.score) || 0; 

            await updateDoc(userRef, {
                "profile.gold": increment(scoreAmount)
            });

            // Б) Записуємо в історію ігор (для аналітики вчителя)
            const historyRef = collection(db, "users", user.uid, "game_history");
            await addDoc(historyRef, {
                topic: data.topic,
                level: data.level,
                grade: data.stars,      // Оцінка
                goldEarned: data.score,
                timestamp: serverTimestamp(),
                dateString: new Date().toLocaleString("uk-UA")
            });

            console.log("✅ Результат успішно збережено в Firebase!");

            // Оновлюємо відображення золота, якщо елемент є на сторінці
            const goldEl = document.getElementById("student-gold-display");
            if(goldEl) {
                let current = parseInt(goldEl.innerText) || 0;
                goldEl.innerText = `${current + data.score} 💰`;
            }

        } catch (e) {
            console.error("❌ Помилка збереження даних з Unity:", e);
        }
    }
});
// =========================================================

function initializeApp() {
    console.log("initializeApp: Start...");

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
    
    setupButtonListener("btn-back-to-home", () => {
        showScreen("screen-home");
        setTimeout(resetForms, 50);
    });

    setupButtonListener("btn-back-auth1", () => { 
        showScreen("screen-auth-choice");
        setTimeout(resetForms, 50);
    });

    setupButtonListener("btn-back-auth2", () => { 
        showScreen("screen-auth-choice");
        setTimeout(resetForms, 50);
    });
    
    setupButtonListener("btn-login", () => { 
        showScreen("screen-login"); 
        setTimeout(resetForms, 50); 
    });

    setupButtonListener("btn-register", () => {
        showScreen("screen-register");
        updateRegisterView(); 
        setTimeout(resetForms, 50);
    });

    setupButtonListener("logout-student", logout);
    setupButtonListener("logout-teacher", logout);

    const handleLoginSuccess = (role) => {
        if (role === "student") {
            showScreen("screen-student");
            setupDashboardNavigation("screen-student");
            initStudentPanel();
        } else {
            showScreen("screen-teacher");
            setupDashboardNavigation("screen-teacher");
            initTeacherPanel(); 
        }
    };

    initAuth(handleLoginSuccess);

    const user = getCurrentUser();
    if (user) {
        currentRole = user.role;
        handleLoginSuccess(user.role);
    } else {
        showScreen("screen-home");
    }
}

initializeApp();

// Тимчасова функція для ремонту
async function fixBrokenGold() {
    console.log("🚑 Починаю лікування золота...");
    const snapshot = await getDocs(collection(db, "users"));
    
    snapshot.forEach(async (userDoc) => {
        const data = userDoc.data();
        // Якщо у профілі NaN або немає золота
        if (data.profile && (isNaN(data.profile.gold) || data.profile.gold === null)) {
            console.log(`🔧 Виправляю користувача: ${data.name || userDoc.id}`);
            await updateDoc(doc(db, "users", userDoc.id), {
                "profile.gold": 0 // Скидаємо поламане золото на 0
            });
        }
    });
    console.log("✅ Лікування завершено (перевірте консоль на помилки)");
}

// Запустити через 3 секунди після завантаження сторінки
setTimeout(fixBrokenGold, 3000);