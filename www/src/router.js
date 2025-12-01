// src/router.js

import { showScreen } from "./ui.js";
import { initAuth, getCurrentUser } from "./auth.js";
import { initStudentPanel } from "./studentPanel.js";
import { initTeacherPanel } from "./teacherPanel.js"; 

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
            // Скидаємо селекти
            form.querySelectorAll("select").forEach(s => s.selectedIndex = 0);
        }
    });

    document.querySelectorAll(".error-msg").forEach(el => el.remove());
    document.getElementById("register-form-content")?.classList.remove("hidden");
    document.getElementById("register-success")?.classList.add("hidden");
}

// 👇 ФУНКЦІЯ НАЛАШТУВАННЯ ВИГЛЯДУ ФОРМИ РЕЄСТРАЦІЇ
function updateRegisterView() {
    const role = localStorage.getItem("selectedRole"); 
    console.log("Налаштування форми для ролі:", role);

    const emailGroup = document.getElementById("email-field-group");
    const classWrapper = document.getElementById("select-class-wrapper");
    const teacherKeyDiv = document.getElementById("register-teacher-key");
    const regTitle = document.querySelector("#screen-register h2");
    
    // Нове поле ID вчителя для учня
    const studentTeacherIdBlock = document.getElementById("student-teacher-id-block");

    if (role === "student") {
        if(regTitle) regTitle.innerText = "Реєстрація Учня";
        if(emailGroup) emailGroup.style.display = "none"; // Ховаємо Email
        if(classWrapper) classWrapper.classList.remove("hidden");
        if(teacherKeyDiv) teacherKeyDiv.classList.add("hidden");
        if(studentTeacherIdBlock) studentTeacherIdBlock.classList.remove("hidden"); // Показуємо ID вчителя

        const emailInput = document.getElementById("reg-email");
        if(emailInput) emailInput.removeAttribute("required");

    } else {
        if(regTitle) regTitle.innerText = "Реєстрація Вчителя";
        if(emailGroup) emailGroup.style.display = "block"; 
        if(classWrapper) classWrapper.classList.add("hidden");
        if(teacherKeyDiv) teacherKeyDiv.classList.remove("hidden");
        if(studentTeacherIdBlock) studentTeacherIdBlock.classList.add("hidden"); // Ховаємо ID вчителя

        const emailInput = document.getElementById("reg-email");
        if(emailInput) emailInput.setAttribute("required", "true");
    }
}

// --- НАВІГАЦІЯ ---
function setupDashboardNavigation(screenId) {
    const container = document.getElementById(screenId);
    if (!container) return;

    const menuButtons = container.querySelectorAll('.menu-item:not(.logout)');
    const views = container.querySelectorAll('.panel-view');

    menuButtons.forEach(btn => {
        btn.onclick = () => {
            const panelName = btn.dataset.panel;
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
        };
    });
}

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
        updateRegisterView(); // 🔥 Оновлюємо вигляд форми
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