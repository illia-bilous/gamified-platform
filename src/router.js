import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser } from "./auth.js";
import { initStudentPanel } from "./studentPanel.js";
import { initTeacherPanel } from "./teacherPanel.js"; // <--- ВАЖЛИВО

let currentRole = null;

// Функція логауту
const logout = () => {
    localStorage.removeItem("currentUser");
    currentRole = null;
    location.hash = "";
    showScreen("screen-home");
};

function setupButtonListener(id, handler) {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener("click", handler);
    }
}

/**
 * Основна навігація (Вкладки)
 */
function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;

    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    const views = container.querySelectorAll('.panel-view');

    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
            
            // Оновлюємо кнопки
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Перемикаємо вкладки
            views.forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });

            const targetView = document.getElementById(`view-${panelName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }
        };
    });
}

function initializeApp() {
    console.log("initializeApp: Start...");

    // Тимчасова очистка
    setupButtonListener("btn-debug-clear-users", () => {
        if (confirm("Видалити ВСІХ користувачів?")) {
            localStorage.clear();
            location.reload();
        }
    });

    // Навігація входу
    setupButtonListener("btn-role-student", () => { currentRole = "student"; showScreen("screen-auth-choice"); });
    setupButtonListener("btn-role-teacher", () => { currentRole = "teacher"; showScreen("screen-auth-choice"); });
    setupButtonListener("btn-back-to-home", () => showScreen("screen-home"));
    setupButtonListener("btn-login", () => showScreen("screen-login"));

    setupButtonListener("btn-register", () => {
        showScreen("screen-register");
        const role = currentRole || "student";
        const teacherKeyField = document.getElementById("register-teacher-key");
        const classSelectField = document.getElementById("select-class-wrapper");
        
        if (role === "teacher") {
            teacherKeyField?.classList.remove("hidden");
            classSelectField?.classList.add("hidden");
        } else {
            teacherKeyField?.classList.add("hidden");
            classSelectField?.classList.remove("hidden");
        }
        document.getElementById("register-form-content")?.classList.remove("hidden");
        document.getElementById("register-success")?.classList.add("hidden");
    });

    setupButtonListener("btn-back-auth1", () => showScreen("screen-auth-choice"));
    setupButtonListener("btn-back-auth2", () => showScreen("screen-auth-choice"));
    setupButtonListener("logout-student", logout);
    setupButtonListener("logout-teacher", logout);

    // Ініціалізація сесії
    const handleLoginSuccess = (role) => {
        if (role === "student") {
            showScreen("screen-student");
            setupDashboardNavigation("screen-student");
            initStudentPanel();
        } else {
            showScreen("screen-teacher");
            setupDashboardNavigation("screen-teacher");
            initTeacherPanel(); // <--- Запуск панелі вчителя
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