// src/teacherPanel.js

import { db } from "./firebase.js";
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    doc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ФУНКЦІЯ ЗАПУСКУ ---
export function initTeacherPanel() {
    console.log("TeacherPanel: Init...");
    renderTeacherDashboard("teacher-content"); 
}

// --- ЛОГІКА ОТРИМАННЯ УНІКАЛЬНИХ КЛАСІВ З БАЗИ ---
async function getUniqueClasses() {
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    const classes = new Set(); 
    let studentCount = 0;

    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.role === "student" && data.className) {
            classes.add(data.className);
            studentCount++;
        }
    });
    
    return { classes: Array.from(classes), totalStudents: studentCount }; 
}

// --- РЕНДЕРИНГ ГОЛОВНОЇ ПАНЕЛІ (БЛОКИ КЛАСІВ) ---
export async function renderTeacherDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Отримати унікальні класи
    const { classes, totalStudents } = await getUniqueClasses();

    container.innerHTML = `
        <div class="teacher-header">
            <h2>📚 Мої класи</h2>
            <p>Всього учнів у системі: ${totalStudents}</p>
        </div>
        <div id="class-cards" class="class-grid"></div>
    `;
    
    const grid = document.getElementById("class-cards");
    
    // 2. Створити картку для кожного класу
    classes.forEach(className => {
        const card = document.createElement("div");
        card.className = "class-card";
        
        card.innerHTML = `
            <h3>${className}</h3>
            <p>Переглянути лідерборд та прогрес</p>
        `;
        
        card.addEventListener('click', () => {
            // ОНОВЛЕННЯ: Викликаємо функцію детального лідерборда
            renderClassLeaderboard(className); 
        });
        
        grid.appendChild(card);
    });

    if (classes.length === 0) {
        grid.innerHTML = '<p style="text-align: center; margin-top: 30px;">У системі ще немає зареєстрованих учнів.</p>';
    }
}

// =========================================================
// 🏆 ЛОГІКА РЕНДЕРИНГУ ЛІДЕРБОРДА ДЛЯ КОНКРЕТНОГО КЛАСУ
// =========================================================

async function renderClassLeaderboard(className) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    // Створюємо базовий інтерфейс для таблиці
    container.innerHTML = `
        <div class="teacher-header">
            <button id="btn-back-to-classes" class="btn btn-secondary">← Назад до класів</button>
            <h2>🏆 Лідерборд класу: ${className}</h2>
            <p>Учні відсортовані за кількістю золота.</p>
        </div>
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>№</th>
                    <th>Ім'я</th>
                    <th>Золото 💰</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody id="class-leaderboard-body">
                </tbody>
        </table>
    `;

    // 1. Обробка кнопки "Назад"
    document.getElementById("btn-back-to-classes").onclick = () => {
        renderTeacherDashboard("teacher-content"); 
    };

    const tbody = document.getElementById("class-leaderboard-body");
    
    // 2. Запит до Firebase: фільтруємо по className та сортуємо по gold
    const q = query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("className", "==", className),
        orderBy("profile.gold", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach(doc => students.push(doc.data()));

    // 3. Рендеринг рядків таблиці
    students.forEach((student, index) => {
        const tr = document.createElement("tr");
        
        let rankDisplay = index + 1;
        if (index === 0) rankDisplay = "🥇 1";
        if (index === 1) rankDisplay = "🥈 2";
        if (index === 2) rankDisplay = "🥉 3";

        tr.innerHTML = `
            <td class="rank-col">${rankDisplay}</td>
            <td class="name-col">${student.name}</td>
            <td class="gold-col">${student.profile.gold || 0} 💰</td>
            <td class="action-col">
                <button class="btn btn-sm btn-view-profile" data-uid="${student.uid}" data-class="${className}">Результати</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // 4. Підключаємо логіку перегляду профілю (замість редагування)
    setupProfileView(students);
}

// =========================================================
// 👁️ ЛОГІКА ПЕРЕГЛЯДУ ПРОФІЛЮ УЧНЯ
// =========================================================

function setupProfileView(students) {
    document.querySelectorAll('.btn-view-profile').forEach(button => {
        button.addEventListener('click', (e) => {
            const studentUid = e.target.dataset.uid;
            const student = students.find(s => s.uid === studentUid);
            
            if (student) {
                renderStudentProfile(student);
            } else {
                alert("Помилка: Дані учня не знайдено!");
            }
        });
    });
}

// =========================================================
// 👤 ФУНКЦІЯ РЕНДЕРИНГУ ПРОФІЛЮ УЧНЯ (ОНОВЛЕНА)
// =========================================================

async function renderStudentProfile(student) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    // Дані для відображення
    const inventory = student.profile.inventory || [];
    
    // 1. Логіка Стакування Нагород
    const stackedInventory = inventory.reduce((acc, item) => {
        const itemName = item.name || 'Нагорода без назви';
        acc[itemName] = (acc[itemName] || 0) + 1;
        return acc;
    }, {});
    
    // 2. Створення HTML-списку з групуванням
    const inventoryKeys = Object.keys(stackedInventory);
    const inventoryList = inventoryKeys.length > 0
        ? inventoryKeys.map(name => {
            const count = stackedInventory[name];
            const countText = count > 1 ? ` (x${count})` : '';
            return `<li>**${name}**${countText}</li>`;
        }).join('')
        : '<li>Нагороди ще не придбані.</li>';
        
    const goldDisplay = student.profile.gold || 0;

    // ... решта функції залишається тією самою до HTML-шаблону

    // HTML-шаблон профілю
    container.innerHTML = `
        <div class="teacher-header" style="text-align: center;">
            <button id="btn-back-to-leaderboard" class="btn btn-secondary" style="float: left;">← Назад до лідерборду</button>
            <h2 style="font-size: 2em; margin-bottom: 5px;">👤 ПРОФІЛЬ УЧНЯ</h2>
            <h1 style="color: var(--accent-gold); margin-top: 0; font-size: 2.5em;">${student.name}</h1>
            <p style="margin-bottom: 30px;">Детальна інформація про прогрес та нагороди.</p>
        </div>

        <div class="profile-dashboard-grid">
            
            <div class="card profile-info-card" style="padding: 20px;">
                <h3 style="color: var(--primary-color); border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-bottom: 20px;">Основні Дані</h3>
                
                <div class="info-line">
                    <strong>🎓 Клас:</strong> <span style="font-size: 1.2em; font-weight: bold;">${student.className}</span>
                </div>
                
                <div class="info-line">
                    <strong>📧 Email:</strong> <span>${student.email}</span>
                </div>
                
            </div>

            <div class="card profile-rewards-card" style="padding: 20px;">
                
                <h3 style="color: var(--accent-gold); text-align: center;">💰 Баланс Золота</h3>
                <p class="big-gold-amount" style="font-size: 3em; font-weight: bold; text-align: center; color: var(--accent-gold); margin-top: 0;">
                    ${goldDisplay} 💰
                </p>
                
                <div style="border-top: 1px dashed #555; margin: 20px 0;"></div>
                
                <h3 style="color: var(--primary-color); text-align: center;">🎁 Отримані Нагороди</h3>
                <ul class="rewards-list" style="list-style-type: none; padding-left: 0;">
                    ${inventoryList}
                </ul>
            </div>
            
        </div>
    `;

    // Обробка кнопки "Назад"
    document.getElementById("btn-back-to-leaderboard").onclick = () => {
        renderClassLeaderboard(student.className); 
    };
}
