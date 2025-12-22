// src/router.js
import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser, renderRegisterForm } from "./auth.js";
import { initStudentPanel } from "./studentPanel.js";
import { initTeacherPanel } from "./teacherPanel.js"; 
import { loadTeacherAnalytics } from "./analytics.js";
// ❌ ВИДАЛЕНО: import { handleGameMessage } from "./gameBridge.js"; 
import { db } from "./firebase.js";
import { 
    doc, 
    updateDoc, 
    collection, 
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentRole = null;

// ❌ ВИДАЛЕНО: window.addEventListener("message", handleGameMessage);
// Тепер це робить studentPanel.js локально для iframe

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

    // --- Кнопки навігації (НАЗАД / ВХІД / РЕЄСТРАЦІЯ) ---
    
    // 1. Головна кнопка "Назад" (на екрані вибору входу/реєстрації)
    setupButtonListener("btn-back-to-home", () => showScreen("screen-home"));

    // 2. Кнопка "Назад" на екрані ВХОДУ (повертає до вибору)
    setupButtonListener("btn-back-auth1", () => showScreen("screen-auth-choice"));

    // 3. Кнопка "Назад" на екрані РЕЄСТРАЦІЇ (повертає до вибору)
    setupButtonListener("btn-back-auth2", () => {
        showScreen("screen-auth-choice");
        resetForms(); 
    });

    // Перехід на екран Входу
    setupButtonListener("btn-login", () => showScreen("screen-login"));
    
    // Перехід на екран Реєстрації
    setupButtonListener("btn-register", () => {
        showScreen("screen-register");
        const role = localStorage.getItem("selectedRole");
        renderRegisterForm(role);
        initAuth(handleLoginSuccess); 
    });

    setupButtonListener("logout-student", logout);
    setupButtonListener("logout-teacher", logout);

    initAuth(handleLoginSuccess);

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

function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;
    
    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    
    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            container.querySelectorAll('.panel-view').forEach(view => {
                view.classList.add('hidden');
                view.classList.remove('active');
            });

            const targetView = document.getElementById(`view-${panelName}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            if (panelName === 'analytics') {
                const user = getCurrentUser();
                if (user?.role === 'teacher') loadTeacherAnalytics(user.uid);
            }
        };
    });
}

initializeApp();
setTimeout(fixBrokenGold, 3000);