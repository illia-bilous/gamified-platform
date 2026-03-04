// src/router.js
import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser, renderRegisterForm } from "./auth.js";
// 👇 ДОДАЛИ renderStudentDiary в імпорт
import { initStudentPanel, renderStudentDiary } from "./studentPanel.js"; 
import { initTeacherPanel } from "./teacherPanel.js"; 
import { loadTeacherAnalytics } from "./analytics.js";
import { db } from "./firebase.js";
import { 
    doc, 
    updateDoc, 
    collection, 
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentRole = null;

// =========================================================
// 🛠 СЛУЖБОВІ ФУНКЦІЇ
// =========================================================

function initializeApp() {
    console.log("initializeApp: Start...");

    const handleLoginSuccess = async (role) => {
        if (role === "student") {
            showScreen("screen-student");
            await initStudentPanel();
            setupDashboardNavigation("screen-student");
            
            // 🔥 АВТО-ЗАВАНТАЖЕННЯ: Якщо ми одразу на щоденнику (рідкісний кейс, але корисно)
            // const user = getCurrentUser();
            // renderStudentDiary(user); 
        } else {
            showScreen("screen-teacher");
            await initTeacherPanel();
            setupDashboardNavigation("screen-teacher");
        }
    };

    // --- Кнопки вибору ролі ---
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

    // --- Навігація ---
    setupButtonListener("btn-back-to-home", () => showScreen("screen-home"));
    setupButtonListener("btn-back-auth1", () => showScreen("screen-auth-choice"));
    setupButtonListener("btn-back-auth2", () => {
        showScreen("screen-auth-choice");
        resetForms(); 
    });

    setupButtonListener("btn-login", () => showScreen("screen-login"));
    
    setupButtonListener("btn-register", () => {
        showScreen("screen-register");
        const role = localStorage.getItem("selectedRole");
        renderRegisterForm(role);
        initAuth(handleLoginSuccess); 
    });

    setupButtonListener("logout-student", logout);
    setupButtonListener("logout-teacher", logout);

    initAuth(handleLoginSuccess);

    initMobileLogic();
    
    const user = getCurrentUser();
    if (user) {
        handleLoginSuccess(user.role);
    } else {
        showScreen("screen-home");
    }
}

// Функція виправлення "битого" золота
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

// 👇 ОСНОВНІ ЗМІНИ ТУТ
function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;
    
    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    
    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
            
            // UI: Перемикання кнопок
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // UI: Перемикання панелей
            container.querySelectorAll('.panel-view').forEach(view => {
                view.classList.add('hidden');
                view.classList.remove('active');
            });

            const targetView = document.getElementById(`view-${panelName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            // 🔥 ЛОГІКА: Завантаження даних при кліку
            const user = getCurrentUser();
            
            // 1. Для Вчителя (Аналітика)
            if (panelName === 'analytics' && user?.role === 'teacher') {
                loadTeacherAnalytics(user.uid);
            }

            // 2. 👇 ДЛЯ УЧНЯ (ЩОДЕННИК) - ДОДАНО ЦЕЙ БЛОК
            if (panelName === 'journal' && user?.role === 'student') {
                console.log("Nav: Клік по щоденнику, завантажуємо...");
                renderStudentDiary(user);
            }
        };
    });
}

// =========================================================
// 📱 МОБІЛЬНА АДАПТАЦІЯ ТА ГАМБУРГЕР
// =========================================================

function initMobileLogic() {
    const setupHamburger = (btnId, screenId) => {
        const btn = document.getElementById(btnId);
        const screen = document.getElementById(screenId);
        if (!btn || !screen) return;

        const sidebar = screen.querySelector('.sidebar');

        btn.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-active');
            // Ми більше не викликаємо btn.classList.toggle('open'), 
            // тому іконка завжди залишається "трьома смужками"
        };

        sidebar.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('mobile-active');
            });
        });
    };

    setupHamburger('hamburger-student', 'screen-student');
    setupHamburger('hamburger-teacher', 'screen-teacher');

    // Закриття сайдбару, якщо клікнули поза ним
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && !e.target.closest('.hamburger-menu')) {
            document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('mobile-active'));
        }
    });

    // 2. Логіка Орієнтації Екрана
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation(); // Початкова перевірка
}

function checkOrientation() {
    const warning = document.getElementById('orientation-warning');
    const isUnityActive = !document.getElementById('unity-container')?.classList.contains('hidden');
    
    // Якщо учень відкрив гру і тримає телефон вертикально (портретно)
    if (isUnityActive && window.innerHeight > window.innerWidth) {
        warning.style.display = 'flex';
    } else {
        warning.style.display = 'none';
    }
}

initializeApp();
setTimeout(fixBrokenGold, 3000);