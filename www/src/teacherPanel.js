// src/teacherPanel.js

import { db } from "./firebase.js";
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    doc, 
    updateDoc,
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getShopItems, updateItemPrice } from "./shopData.js"; 

// --- ФУНКЦІЯ ЗАПУСКУ ---
export function initTeacherPanel() {
    console.log("TeacherPanel: Init...");
    
    // 1. Головна панель (Класи)
    renderTeacherDashboard("teacher-content"); 

    // 2. Редактор Скарбниці
    setTimeout(() => {
        renderTreasureEditor();
    }, 100); 

    // 3. Редактор Лабіринту (НОВИЙ)
    setTimeout(() => {
        initMazeEditor();
    }, 100);
}

// ==========================================
// 🧩 ЛАБІРИНТ — ЛОГІКА РЕДАКТОРА
// ==========================================

const LEVEL_TEMPLATE = [
    { id: 1, name: "🚪 Двері №1 (Вхід)", desc: "Ключ лежить на старті." },
    { id: 2, name: "🚪 Двері №2 (Центр)", desc: "Блокують прохід до розвилки." },
    { id: 3, name: "🚪 Двері №3 (Скриня)", desc: "Останні двері перед скарбом." }
];

let mazeConfigData = {
    reward: 100,
    doors: []
};

function initMazeEditor() {
    console.log("Maze Editor: Init");

    // Завантажуємо локальну копію
    const savedData = localStorage.getItem("game_config_data");
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            mazeConfigData = { ...mazeConfigData, ...parsed };
            
            if (document.getElementById("maze-global-reward")) {
                document.getElementById("maze-global-reward").value = mazeConfigData.reward;
            }
        } catch (e) {
            console.error("Помилка читання конфігу", e);
        }
    }

    renderDoorsForm();

    const btnSave = document.getElementById("btn-save-maze-config");
    if (btnSave) {
        const newBtn = btnSave.cloneNode(true);
        btnSave.parentNode.replaceChild(newBtn, btnSave);
        newBtn.addEventListener("click", saveConfiguration);
    }
}

function renderDoorsForm() {
    const container = document.getElementById("maze-doors-container");
    if (!container) return;

    container.innerHTML = "";

    LEVEL_TEMPLATE.forEach(templateItem => {
        const savedDoor = mazeConfigData.doors.find(d => d.id === templateItem.id) || {};
        const savedQ = savedDoor.question || "";
        const savedA = savedDoor.answer || "";

        const card = document.createElement("div");
        card.className = "door-config-card";
        card.style.cssText = "background: #333; padding: 15px; border-radius: 8px; border-left: 5px solid var(--accent-teal); position: relative;";

        // type="text" для відповіді, щоб приймати і числа, і слова
        card.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; justify-content: space-between;">
                <strong style="font-size: 1.1em; color: #fff;">${templateItem.name}</strong>
                <span style="font-size: 0.8em; color: #aaa;">${templateItem.desc}</span>
            </div>
            <div style="display: flex; gap: 15px; align-items: flex-start;">
                <div style="flex: 2;">
                    <label style="font-size: 0.8em; color: #ccc;">Питання (x, sin, sqrt...)</label>
                    <input type="text" class="inp-question" data-id="${templateItem.id}" value="${savedQ}" placeholder="Напр: sin(x) = 0.5" 
                           style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #222; color: white;">
                </div>
                <div style="flex: 1;">
                    <label style="font-size: 0.8em; color: #ccc;">Відповідь</label>
                    <input type="text" class="inp-answer" data-id="${templateItem.id}" value="${savedA}" placeholder="30" 
                           style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #222; color: white;">
                </div>
            </div>
            <div id="math-warning-${templateItem.id}" style="color: #f1c40f; font-size: 0.85em; margin-top: 5px; display: none;">
                ⚠️ <span class="warn-text">...</span>
            </div>
        `;

        container.appendChild(card);

        const qInput = card.querySelector(`.inp-question`);
        const aInput = card.querySelector(`.inp-answer`);
        
        const validateMath = async () => {
            const warningBox = card.querySelector(`#math-warning-${templateItem.id}`);
            const warningText = warningBox.querySelector(".warn-text");
            
            let qVal = qInput.value.replace(/,/g, '.');
            let aValRaw = aInput.value; 
            
            // 1. Авто-заміна: Українська 'х' -> Англійська 'x'
            qVal = qVal.replace(/[хХ]/g, 'x'); 
            
            // 2. Авто-заміна: шкільний 'log' -> комп'ютерний 'log10'
            // (але не ламаємо слова типу "logic")
            qVal = qVal.replace(/\blog\(/g, 'log10(');

            if (!qVal || !aValRaw) {
                warningBox.style.display = "none";
                return;
            }

            // Перевіряємо, чи відповідь є числом
            const isAnswerNumeric = !isNaN(parseFloat(aValRaw.replace(',', '.'))) && isFinite(aValRaw.replace(',', '.'));

            // Якщо відповідь ТЕКСТ ("Париж") — не перевіряємо математику
            if (!isAnswerNumeric) {
                warningBox.style.display = "none";
                aInput.style.border = "1px solid #2ecc71";
                return;
            }

            const answerNumber = parseFloat(aValRaw.replace(',', '.'));

            try {
                const math = await import('https://esm.run/mathjs');

                // 🔥🔥🔥 НАЛАШТУВАННЯ ГРАДУСІВ 🔥🔥🔥
                // Ми створюємо "свій" світ математики, де sin(30) = 0.5
                const customScope = {
                    x: answerNumber,
                    // Перевизначаємо функції: якщо аргумент число — рахуємо як градуси
                    sin: (a) => typeof a === 'number' ? math.sin(math.unit(a, 'deg')) : math.sin(a),
                    cos: (a) => typeof a === 'number' ? math.cos(math.unit(a, 'deg')) : math.cos(a),
                    tan: (a) => typeof a === 'number' ? math.tan(math.unit(a, 'deg')) : math.tan(a)
                };

                let isCorrect = false;
                let calculatedValue = null;

                // СЦЕНАРІЙ 1: Рівняння (=)
                if (qVal.includes('=')) {
                    const parts = qVal.split('=');
                    if (parts.length === 2) {
                        const leftSide = math.evaluate(parts[0], customScope);
                        const rightSide = math.evaluate(parts[1], customScope);
                        isCorrect = math.abs(leftSide - rightSide) < 0.01;
                        
                        if (!isCorrect) {
                            warningText.innerHTML = `При x=${answerNumber}: Ліва (${math.round(leftSide, 2)}) ≠ Права (${math.round(rightSide, 2)})`;
                        }
                    }
                } 
                // СЦЕНАРІЙ 2: Вираз
                else {
                    calculatedValue = math.evaluate(qVal, customScope);
                    isCorrect = math.abs(calculatedValue - answerNumber) < 0.01;

                    if (!isCorrect) {
                        warningText.innerHTML = `Ви ввели <b>${answerNumber}</b>, а результат: <b>${math.round(calculatedValue, 2)}</b>`;
                    }
                }

                if (isCorrect) {
                    warningBox.style.display = "none";
                    aInput.style.border = "1px solid #2ecc71"; // Зелений
                } else {
                    warningBox.style.display = "block";
                    aInput.style.border = "1px solid #e74c3c"; // Червоний
                }

            } catch (err) {
                // Ігноруємо помилки (це може бути просто текст питання)
                const hasMathSymbols = /[=+\-*/^]/.test(qVal);
                if (hasMathSymbols && qVal.match(/[0-9x]/)) {
                    console.warn("Math error:", err);
                    warningText.innerHTML = `⚠️ <b>Помилка формули.</b> Перевірте дужки.`;
                    warningBox.style.display = "block";
                    aInput.style.border = "1px solid #f1c40f"; 
                } else {
                    warningBox.style.display = "none";
                    aInput.style.border = "1px solid #2ecc71"; // Вважаємо текстом -> Зелений
                }
            }
        };

        qInput.addEventListener("input", validateMath);
        aInput.addEventListener("input", validateMath);
    });
}

async function saveConfiguration() {
    const rewardInput = document.getElementById("maze-global-reward");
    mazeConfigData.reward = parseInt(rewardInput.value) || 100;

    const newDoorsData = [];
    
    LEVEL_TEMPLATE.forEach(tpl => {
        const qInput = document.querySelector(`.inp-question[data-id="${tpl.id}"]`);
        const aInput = document.querySelector(`.inp-answer[data-id="${tpl.id}"]`);

        if (qInput && aInput) {
            newDoorsData.push({
                id: tpl.id,
                question: qInput.value.trim() || "???",
                answer: parseInt(aInput.value) || 0
            });
        }
    });

    mazeConfigData.doors = newDoorsData;

    const finalExport = {
        ...mazeConfigData,
        btnText: "Win" 
    };

    // 1. Локально
    localStorage.setItem("game_config_data", JSON.stringify(finalExport));

    // 2. Хмара
    const status = document.getElementById("maze-save-status");
    if(status) {
        status.innerHTML = "⏳ Збереження в хмару...";
        status.style.display = "block";
    }

    try {
        await setDoc(doc(db, "game_config", "maze_1"), finalExport);
        console.log("Saved to Cloud:", finalExport);

        if(status) {
            status.innerHTML = "✅ Успішно збережено для всіх учнів!";
            setTimeout(() => status.style.display = "none", 3000);
        }
    } catch (e) {
        console.error("Помилка збереження в БД:", e);
        if(status) status.innerHTML = "❌ Помилка збереження! Див. консоль.";
    }
}

// ==========================================
// 📚 ГОЛОВНА ПАНЕЛЬ ВЧИТЕЛЯ (КЛАСИ)
// ==========================================

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

export async function renderTeacherDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { classes, totalStudents } = await getUniqueClasses();

    container.innerHTML = `
        <div class="teacher-header">
            <h2>📚 Мої класи</h2>
            <p>Всього учнів у системі: ${totalStudents}</p>
        </div>
        <div id="class-cards" class="class-grid"></div>
    `;
    
    const grid = document.getElementById("class-cards");
    
    classes.forEach(className => {
        const card = document.createElement("div");
        card.className = "class-card";
        card.innerHTML = `
            <h3>${className}</h3>
            <p>Переглянути лідерборд та прогрес</p>
        `;
        card.addEventListener('click', () => { renderClassLeaderboard(className); });
        grid.appendChild(card);
    });

    if (classes.length === 0) {
        grid.innerHTML = '<p style="text-align: center; margin-top: 30px;">У системі ще немає учнів.</p>';
    }
}

// ==========================================
// 🏆 ЛІДЕРБОРД КЛАСУ
// ==========================================

async function renderClassLeaderboard(className) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header">
            <button id="btn-back-to-classes" class="btn btn-secondary">← Назад до класів</button>
            <h2>🏆 Лідерборд: ${className}</h2>
            <p>Сортування за золотом.</p>
        </div>
        <table class="leaderboard-table">
            <thead><tr><th>№</th><th>Ім'я</th><th>Золото 💰</th><th>Дії</th></tr></thead>
            <tbody id="class-leaderboard-body"></tbody>
        </table>
    `;

    document.getElementById("btn-back-to-classes").onclick = () => renderTeacherDashboard("teacher-content");

    const tbody = document.getElementById("class-leaderboard-body");

    const q = query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("className", "==", className),
        orderBy("profile.gold", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach(doc => students.push({ ...doc.data(), uid: doc.id }));

    students.forEach((student, index) => {
        const tr = document.createElement("tr");
        let rank = index + 1;
        if (index === 0) rank = "🥇 1";
        if (index === 1) rank = "🥈 2";
        if (index === 2) rank = "🥉 3";

        tr.innerHTML = `
            <td class="rank-col">${rank}</td>
            <td class="name-col">${student.name}</td>
            <td class="gold-col">${student.profile.gold || 0} 💰</td>
            <td class="action-col">
                <button class="btn btn-sm btn-view-profile" data-uid="${student.uid}" data-class="${className}">Результати</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    setupProfileView(students);
}

// ==========================================
// 👤 ПРОФІЛЬ УЧНЯ
// ==========================================

function setupProfileView(students) {
    document.querySelectorAll('.btn-view-profile').forEach(button => {
        button.addEventListener('click', e => {
            const studentUid = e.target.dataset.uid;
            const student = students.find(s => s.uid === studentUid);

            if (student) renderStudentProfile(student);
            else alert("Помилка: дані учня не знайдені!");
        });
    });
}

async function renderStudentProfile(student) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    const inventory = student.profile.inventory || [];
    const stackedInventory = inventory.reduce((acc, item) => {
        const itemName = item.name || "Нагорода";
        acc[itemName] = (acc[itemName] || 0) + 1;
        return acc;
    }, {});

    const inventoryList = Object.keys(stackedInventory).length
        ? Object.keys(stackedInventory)
            .map(x => `<li>${x} ${stackedInventory[x] > 1 ? `(x${stackedInventory[x]})` : ""}</li>`).join("")
        : "<li>Немає нагород</li>";

    const goldDisplay = student.profile.gold || 0;

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
                <div class="info-line"><strong>🎓 Клас:</strong> ${student.className}</div>
                <div class="info-line"><strong>📧 Email:</strong> ${student.email}</div>
            </div>

            <div class="card profile-rewards-card" style="padding: 20px;">
                <h3 style="color: var(--accent-gold); text-align: center;">💰 Баланс Золота</h3>
                <p id="current-gold-display" class="big-gold-amount" style="font-size: 3em; font-weight: bold; text-align: center; color: var(--accent-gold); margin-top: 0;">
                    ${goldDisplay} 💰
                </p>
                <div class="gold-editor-controls" style="margin-bottom: 20px; text-align: center;">
                    <input type="number" id="gold-amount-input" placeholder="Нова кількість" style="width: 50%; padding: 8px; margin-right: 5px; color: black; border-radius: 5px;">
                    <button id="btn-update-gold" data-uid="${student.uid}" class="btn btn-sm" style="background-color: #f39c12; color: white; border:none; padding: 8px 15px; cursor: pointer;">Оновити</button>
                </div>
                <div style="border-top: 1px dashed #555; margin: 20px 0;"></div>
                <h3 style="color: var(--primary-color); text-align: center;">🎁 Отримані Нагороди</h3>
                <ul class="rewards-list" style="list-style-type: none; padding-left: 0;">${inventoryList}</ul>
            </div>
        </div>
    `;

    document.getElementById("btn-update-gold").addEventListener('click', async () => {
        const inputElement = document.getElementById("gold-amount-input");
        const newGoldValue = parseInt(inputElement.value);

        if (isNaN(newGoldValue) || newGoldValue < 0) {
            alert("Будь ласка, введіть дійсне додатне число для золота.");
            return;
        }

        try {
            const studentRef = doc(db, "users", student.uid);
            await updateDoc(studentRef, { "profile.gold": newGoldValue });
            document.getElementById("current-gold-display").innerHTML = `${newGoldValue} 💰`;
            inputElement.value = ''; 
            alert(`Золото учня ${student.name} успішно оновлено до ${newGoldValue}.`);
        } catch (error) {
            console.error("Помилка оновлення золота:", error);
            alert("Помилка при оновленні золота.");
        }
    });
    
    document.getElementById("btn-back-to-leaderboard").onclick = () => {
        renderClassLeaderboard(student.className); 
    };
}

// ==========================================
// 💎 РЕДАКТОР СКАРБНИЦІ (МАГАЗИН)
// ==========================================

async function renderTreasureEditor() {
    const container = document.getElementById("treasury-content");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header" style="text-align: center;">
            <h2 style="font-size: 2.5em; color: var(--accent-gold);">💎 РЕДАГУВАННЯ ЦІН СКАРБНИЦІ</h2>
            <p style="margin-bottom: 30px;">Тут ви можете змінювати ціни на нагороди для учнів.</p>
        </div>
        <div class="category-grid" style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
            <div class="editor-category-block" style="flex: 1; min-width: 300px; background: #1a1a1a; padding: 15px; border-radius: 10px; border: 1px solid #333;">
                <h3 style="color: #2ecc71; text-align: center; border-bottom: 1px solid #333; padding-bottom: 10px;">Мікро-нагороди</h3>
                <div id="teacher-rewards-micro" class="rewards-editor-list"></div>
            </div>
            <div class="editor-category-block" style="flex: 1; min-width: 300px; background: #1a1a1a; padding: 15px; border-radius: 10px; border: 1px solid #333;">
                <h3 style="color: #3498db; text-align: center; border-bottom: 1px solid #333; padding-bottom: 10px;">Середні нагороди</h3>
                <div id="teacher-rewards-medium" class="rewards-editor-list"></div>
            </div>
            <div class="editor-category-block" style="flex: 1; min-width: 300px; background: #1a1a1a; padding: 15px; border-radius: 10px; border: 1px solid #333;">
                <h3 style="color: #9b59b6; text-align: center; border-bottom: 1px solid #333; padding-bottom: 10px;">Великі нагороди</h3>
                <div id="teacher-rewards-large" class="rewards-editor-list"></div>
            </div>
        </div>
    `;

    try {
        const items = getShopItems(); 
        renderCategory("teacher-rewards-micro", items.micro);
        renderCategory("teacher-rewards-medium", items.medium);
        renderCategory("teacher-rewards-large", items.large);
    } catch (e) {
        console.error("Помилка завантаження товарів:", e);
    }
}

function renderCategory(containerId, itemList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ""; 

    itemList.forEach(item => {
        const div = document.createElement("div");
        div.className = "shop-item";
        div.style.background = "#2c3e50"; 
        div.style.border = "1px solid #34495e";
        div.style.borderRadius = "8px";
        div.style.padding = "10px";
        div.style.marginBottom = "15px";

        div.innerHTML = `
            <div class="shop-item-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <div class="item-name" style="color: #ecf0f1; font-weight: bold;">${item.name}</div>
                <div style="width: 50%; text-align: right; display: flex; align-items: center; justify-content: flex-end;">
                    <input type="number" id="price-${item.id}" value="${item.price}" 
                           style="width: 70px; padding: 5px; background: #34495e; color: #f1c40f; border: 1px solid #555; border-radius: 5px; text-align: center; margin-right: 5px;">
                    <span style="color: #f1c40f;">💰</span>
                </div>
            </div>
            <div class="item-desc" style="margin-bottom: 10px; font-size: 0.8rem; color: #bdc3c7;">${item.desc}</div>
            <button class="btn-save-price" data-id="${item.id}" 
                    style="width: 100%; padding: 8px; background: #27ae60; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; text-transform: uppercase;">
                💾 Зберегти ціну
            </button>
        `;

        const btn = div.querySelector(".btn-save-price");
        btn.onclick = () => {
            const input = document.getElementById(`price-${item.id}`);
            const newPrice = parseInt(input.value);
            if (isNaN(newPrice) || newPrice < 0) { alert("Некоректне число."); return; }

            const success = updateItemPrice(item.id, newPrice);
            if (success) {
                alert(`Ціну на "${item.name}" оновлено до ${newPrice}!`);
                btn.style.backgroundColor = "#1abc9c"; 
                setTimeout(() => btn.style.backgroundColor = "#27ae60", 1000);
            }
        };
        container.appendChild(div);
    });
}