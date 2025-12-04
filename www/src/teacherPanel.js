// src/teacherPanel.js

import { db } from "./firebase.js";
import { getCurrentUser } from "./auth.js"; 
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    doc, 
    updateDoc,
    setDoc,
    getDoc
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

    // 3. 🔥 Новий Редактор Рівнів
    setTimeout(() => {
        renderLevelEditor();
    }, 100);
}

// ==========================================
// 📚 ГОЛОВНА ПАНЕЛЬ ВЧИТЕЛЯ (КЛАСИ)
// ==========================================
// (Цей блок без змін, як у вас)

async function getUniqueClasses(teacherId) {
    const q = query(collection(db, "users"), where("role", "==", "student"), where("teacherUid", "==", teacherId));
    const usersSnapshot = await getDocs(q);
    const classes = new Set(); 
    let studentCount = 0;
    usersSnapshot.forEach(doc => { const data = doc.data(); if (data.className) { classes.add(data.className); studentCount++; } });
    return { classes: Array.from(classes), totalStudents: studentCount }; 
}

export async function renderTeacherDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const myDisplayId = currentUser.teacherCode || currentUser.uid;
    const { classes, totalStudents } = await getUniqueClasses(currentUser.uid);

    container.innerHTML = `
        <div class="teacher-header">
            <h2>📚 Мої класи</h2>
            <div style="background: #333; padding: 15px; border-radius: 8px; border: 2px solid var(--accent-gold); display: inline-block; margin-top: 10px; text-align: center;">
                <span style="color: #aaa; font-size: 0.9em;">Ваш ID для учнів:</span><br>
                <strong style="color: #fff; font-family: monospace; font-size: 2em; letter-spacing: 3px;">${myDisplayId}</strong>
            </div>
            <p style="margin-top: 10px;">Всього учнів у вашій групі: ${totalStudents}</p>
        </div>
        <div id="class-cards" class="class-grid"></div>
    `;
    const grid = document.getElementById("class-cards");
    classes.forEach(className => {
        const card = document.createElement("div");
        card.className = "class-card";
        card.innerHTML = `<h3>${className}</h3><p>Переглянути успішність</p>`;
        card.addEventListener('click', () => { renderClassLeaderboard(className); });
        grid.appendChild(card);
    });
    if (classes.length === 0) grid.innerHTML = '<p style="text-align: center;">У вас ще немає зареєстрованих учнів.</p>';
}

// ==========================================
// 🏆 ЛІДЕРБОРД КЛАСУ
// ==========================================

async function renderClassLeaderboard(className) {
    const container = document.getElementById("teacher-content");
    if (!container) return;
    const currentUser = getCurrentUser();

    container.innerHTML = `
        <div class="teacher-header">
            <button id="btn-back-to-classes" class="btn btn-secondary">← Назад до класів</button>
            <h2>🏆 Лідерборд: ${className}</h2>
        </div>
        <div style="background: #222; padding: 20px; border-radius: 10px; min-height: 300px;">
            <table class="leaderboard-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                <thead>
                    <tr style="color: #aaa; text-align: left;">
                        <th style="padding: 10px 20px;">Місце</th>
                        <th>Ім'я</th>
                        <th>Золото</th>
                        <th>Дії</th>
                    </tr>
                </thead>
                <tbody id="class-leaderboard-body"></tbody>
            </table>
        </div>
    `;

    document.getElementById("btn-back-to-classes").onclick = () => renderTeacherDashboard("teacher-content");
    const tbody = document.getElementById("class-leaderboard-body");
    
    const q = query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("className", "==", className),
        where("teacherUid", "==", currentUser.uid), 
        orderBy("profile.gold", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach(doc => { students.push({ ...doc.data(), uid: doc.id }); });

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Список порожній</td></tr>';
        return;
    }

    students.forEach((student, index) => {
        const tr = document.createElement("tr");
        let rankClass = "rank-other"; 
        let rankIcon = `#${index + 1}`;
        if (index === 0) { rankClass = "rank-1"; rankIcon = "👑 1"; }
        else if (index === 1) { rankClass = "rank-2"; rankIcon = "🥈 2"; }
        else if (index === 2) { rankClass = "rank-3"; rankIcon = "🥉 3"; }

        tr.className = rankClass;
        tr.innerHTML = `
            <td class="rank-col" style="font-weight:bold;">${rankIcon}</td>
            <td class="name-col" style="font-size: 1.1em; color: white;">${student.name}</td>
            <td class="gold-col" style="color: #f1c40f; font-weight: bold;">${student.profile.gold || 0} 💰</td>
            <td class="action-col">
                <button class="btn btn-sm btn-view-profile" data-uid="${student.uid}" style="background: rgba(255,255,255,0.1); border: 1px solid #777;">Профіль</button>
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
        button.addEventListener('click', (e) => {
            const studentUid = e.target.dataset.uid;
            const student = students.find(s => s.uid === studentUid);
            if (student) renderStudentProfile(student);
        });
    });
}

async function renderStudentProfile(student) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    const inventory = student.profile.inventory || [];
    const stackedInventory = inventory.reduce((acc, item) => {
        const itemName = item.name || 'Нагорода';
        acc[itemName] = (acc[itemName] || 0) + 1;
        return acc;
    }, {});
    
    const inventoryList = Object.keys(stackedInventory).length > 0
        ? Object.keys(stackedInventory).map(name => `<li>${name} (x${stackedInventory[name]})</li>`).join('')
        : '<li>Нагороди ще не придбані.</li>';
        
    let goldDisplay = student.profile.gold || 0; 

    container.innerHTML = `
        <div class="teacher-header" style="text-align: center;">
            <button id="btn-back-to-leaderboard" class="btn btn-secondary" style="float: left;">← Назад</button>
            <h2 style="font-size: 2em; margin-bottom: 5px;">👤 ПРОФІЛЬ УЧНЯ</h2>
            <h1 style="color: var(--accent-gold);">${student.name}</h1>
            <p style="margin-bottom: 30px;">ID: <span style="font-family: monospace;">${student.loginID || "N/A"}</span></p>
        </div>

        <div class="profile-dashboard-grid">
            <div class="card profile-info-card" style="padding: 20px;">
                <h3 style="color: var(--primary-color);">Основні Дані</h3>
                <div class="info-line"><strong>🎓 Клас:</strong> ${student.className}</div>
                <div class="info-line"><strong>📧 Логін:</strong> ${student.loginID || student.email}</div>
            </div>

            <div class="card profile-rewards-card" style="padding: 20px;">
                <h3 style="color: var(--accent-gold); text-align: center;">💰 Баланс Золота</h3>
                <p id="current-gold-display" class="big-gold-amount" style="font-size: 3em; font-weight: bold; text-align: center; color: var(--accent-gold);">${goldDisplay} 💰</p>
                
                <div class="gold-editor-controls" style="margin-bottom: 20px; text-align: center;">
                    <input type="number" id="gold-amount-input" placeholder="Нова кількість" style="width: 50%; padding: 8px; border-radius: 5px;">
                    <button id="btn-update-gold" class="btn btn-sm" style="background-color: #f39c12; color: white;">Оновити</button>
                </div>
                
                <h3 style="color: var(--primary-color); text-align: center;">🎁 Інвентар</h3>
                <ul class="rewards-list">${inventoryList}</ul>
            </div>
        </div>
    `;

    document.getElementById("btn-update-gold").addEventListener('click', async () => {
        const inputElement = document.getElementById("gold-amount-input");
        const newGoldValue = parseInt(inputElement.value);
        if (isNaN(newGoldValue) || newGoldValue < 0) { alert("Введіть коректне число."); return; }

        try {
            const studentRef = doc(db, "users", student.uid);
            await updateDoc(studentRef, { "profile.gold": newGoldValue });
            document.getElementById("current-gold-display").innerHTML = `${newGoldValue} 💰`;
            inputElement.value = ''; 
            alert(`Баланс оновлено!`);
        } catch (error) { console.error("Помилка:", error); alert("Помилка оновлення."); }
    });
    
    document.getElementById("btn-back-to-leaderboard").onclick = () => renderClassLeaderboard(student.className);
}

// ==========================================
// 📝 НОВИЙ РЕДАКТОР РІВНІВ (UNITY)
// ==========================================

async function renderLevelEditor() {
    // Шукаємо контейнер (id в HTML має бути "view-tasks")
    const container = document.getElementById("view-tasks"); 
    if (!container) return;

    // 1. Структура HTML
    container.innerHTML = `
        <div class="teacher-header" style="text-align:center;">
            <h2>📝 Конструктор Рівнів</h2>
            <p>Налаштуйте завдання, час та нагороду для кожного рівня.</p>
        </div>

        <div style="max-width: 800px; margin: 0 auto; background: #222; padding: 20px; border-radius: 10px; border: 1px solid #444;">
            
            <div style="display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap;">
                <select id="editor-topic" style="padding: 10px; border-radius: 5px; background: #333; color: white; border: 1px solid #555;">
                    <option value="Fractions">Тема: Дроби</option>
                    <option value="Powers">Тема: Степені</option>
                    <option value="Quadratics">Тема: Рівняння</option>
                </select>

                <select id="editor-level" style="padding: 10px; border-radius: 5px; background: #333; color: white; border: 1px solid #555;">
                    <option value="1">Рівень 1 (Легкий)</option>
                    <option value="2">Рівень 2 (Середній)</option>
                    <option value="3">Рівень 3 (Складний)</option>
                </select>

                <button id="btn-load-level" class="btn" style="width: auto; padding: 10px 20px; background: #3498db; margin:0;">Завантажити</button>
            </div>

            <hr style="border-color: #444; margin-bottom: 20px;">

            <div id="level-form-area" style="opacity: 0.5; pointer-events: none; transition: opacity 0.3s;">
                
                <div style="margin-bottom: 20px;">
                    <label style="color: #ccc; display:block; margin-bottom:5px;">Питання на дверях (Підтримує формули):</label>
                    <input type="text" id="edit-question" placeholder="Напр: 2x + 4 = 10" 
                           style="width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #555; color: white; font-family: monospace; font-size: 1.1em;">
                </div>

                <div style="display: flex; gap: 20px; margin-bottom: 20px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <label style="color: #2ecc71; font-weight:bold;">✅ Правильна відповідь:</label>
                        <input type="text" id="edit-correct" placeholder="3" 
                               style="width: 100%; padding: 12px; background: #1a1a1a; border: 2px solid #2ecc71; color: white; font-weight:bold;">
                        <div id="math-validation-msg" style="font-size: 0.9em; margin-top: 5px; height: 1.2em; font-weight: bold;"></div>
                    </div>
                </div>

                <label style="color: #e74c3c; margin-bottom: 5px; display:block;">❌ Неправильні варіанти (Ключі-пастки):</label>
                <div class="wrong-answers-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 1" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 2" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 3" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 4" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                </div>

                <div style="background: #2c3e50; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #34495e;">
                    <h4 style="margin-top:0; color: #3498db;">⚙️ Налаштування рівня</h4>
                    <div style="display: flex; gap: 20px;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.9em; color: #bdc3c7;">⏳ Час на проходження (сек):</label>
                            <input type="number" id="edit-time" value="60" 
                                   style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #555; color: white; text-align: center;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 0.9em; color: #f1c40f;">💰 Золото за перемогу:</label>
                            <input type="number" id="edit-gold" value="100" 
                                   style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #f1c40f; color: #f1c40f; font-weight: bold; text-align: center;">
                        </div>
                    </div>
                </div>

                <button id="btn-save-level" class="btn" style="background: #27ae60; width: 100%; font-size: 1.2em; padding: 15px;">💾 ЗБЕРЕГТИ РІВЕНЬ</button>
                <p id="level-save-status" style="text-align: center; color: #aaa; margin-top: 10px; min-height: 20px;"></p>
            </div>
        </div>
    `;

    // 2. Ініціалізація логіки
    setupLevelEditorLogic();
}

function setupLevelEditorLogic() {
    const user = getCurrentUser();
    const btnLoad = document.getElementById("btn-load-level");
    const btnSave = document.getElementById("btn-save-level");
    const formArea = document.getElementById("level-form-area");
    const statusText = document.getElementById("level-save-status");
    const topicSel = document.getElementById("editor-topic");
    const levelSel = document.getElementById("editor-level");

    // Поля введення
    const qInput = document.getElementById("edit-question");
    const cInput = document.getElementById("edit-correct");
    const wInputs = document.querySelectorAll(".inp-wrong");
    const timeInput = document.getElementById("edit-time");
    const goldInput = document.getElementById("edit-gold");
    const validationMsg = document.getElementById("math-validation-msg");

    // --- АВТО-ВАЛІДАЦІЯ (Математика) ---
    const validateMath = async () => {
        let qVal = qInput.value.replace(/,/g, '.');
        let aVal = cInput.value.replace(/,/g, '.');

        if (!qVal || !aVal) { 
            validationMsg.innerHTML = ""; 
            cInput.style.border = "2px solid #2ecc71"; // Зелений за замовчуванням поки пусто
            return; 
        }

        // Ігноруємо текст (якщо це не x)
        if (/[a-wy-zA-WY-Zа-яА-Я]/.test(aVal)) {
            validationMsg.innerHTML = "ℹ️ Текстова відповідь (без перевірки)";
            validationMsg.style.color = "#3498db";
            cInput.style.border = "2px solid #3498db";
            return;
        }

        try {
            // Динамічний імпорт бібліотеки Math.js
            const math = await import('https://esm.run/mathjs');
            
            let isCorrect = false;

            // 1. Якщо це рівняння (містить =)
            if (qVal.includes('=')) {
                const parts = qVal.split('=');
                // Підставляємо відповідь замість 'x'
                const scope = { x: parseFloat(aVal) };
                const left = math.evaluate(parts[0], scope);
                const right = math.evaluate(parts[1], scope);
                
                // Порівнюємо ліву і праву частини
                if (math.abs(left - right) < 0.01) isCorrect = true;
            } 
            // 2. Якщо це вираз (напр. "2 + 2")
            else {
                const res = math.evaluate(qVal);
                if (math.abs(res - parseFloat(aVal)) < 0.01) isCorrect = true;
            }

            if (isCorrect) {
                validationMsg.innerHTML = "✅ Математично вірно!";
                validationMsg.style.color = "#2ecc71";
                cInput.style.border = "2px solid #2ecc71";
            } else {
                validationMsg.innerHTML = "⚠️ Помилка? Перевірте розрахунки.";
                validationMsg.style.color = "#f1c40f";
                cInput.style.border = "2px solid #f1c40f";
            }

        } catch (e) {
            // Якщо не вдалося порахувати (складна формула) - не блокуємо
            validationMsg.innerHTML = "";
            cInput.style.border = "2px solid #2ecc71";
        }
    };

    // Слухаємо зміни в полях для валідації
    qInput.addEventListener("input", validateMath);
    cInput.addEventListener("input", validateMath);

    // --- ЛОГІКА ЗАВАНТАЖЕННЯ ---
    btnLoad.onclick = async () => {
        const key = `${topicSel.value}_${levelSel.value}`; // Напр: "Fractions_1"
        
        statusText.textContent = "⏳ Завантаження...";
        formArea.style.opacity = "0.5";

        try {
            const docRef = doc(db, "teacher_configs", user.uid);
            const docSnap = await getDoc(docRef);

            // Очищення полів
            qInput.value = "";
            cInput.value = "";
            wInputs.forEach(i => i.value = "");
            validationMsg.innerHTML = "";
            
            // --- АВТО-ЗАПОВНЕННЯ ДЕФОЛТІВ ---
            if (levelSel.value === "3") {
                goldInput.value = "300"; // Бонус за складність
            } else {
                goldInput.value = "100";
            }
            timeInput.value = "60";

            if (docSnap.exists()) {
                const data = docSnap.data();
                const levelData = data[key];

                if (levelData) {
                    qInput.value = levelData.question || "";
                    cInput.value = levelData.correctAnswer || "";
                    
                    if (levelData.wrongAnswers) {
                        levelData.wrongAnswers.forEach((ans, idx) => {
                            if (wInputs[idx]) wInputs[idx].value = ans;
                        });
                    }
                    if (levelData.timeLimit) timeInput.value = levelData.timeLimit;
                    if (levelData.goldReward) goldInput.value = levelData.goldReward;
                    
                    statusText.textContent = "✅ Дані завантажено!";
                } else {
                    statusText.textContent = "ℹ️ Для цього рівня ще немає даних. Створено шаблон.";
                }
            } else {
                statusText.textContent = "ℹ️ Створіть своє перше завдання.";
            }

            formArea.style.opacity = "1";
            formArea.style.pointerEvents = "auto";
            validateMath(); // Перевірити валідацію одразу після завантаження

        } catch (e) {
            console.error(e);
            statusText.textContent = "❌ Помилка завантаження.";
        }
    };

    // --- ЛОГІКА ЗБЕРЕЖЕННЯ ---
    btnSave.onclick = async () => {
        const key = `${topicSel.value}_${levelSel.value}`;
        
        // Збираємо неправильні відповіді (тільки ті, що не пусті)
        const wrongs = [];
        wInputs.forEach(input => {
            if(input.value.trim() !== "") wrongs.push(input.value.trim());
        });

        if(!qInput.value || !cInput.value) {
            alert("Помилка: Питання та Правильна відповідь обов'язкові!");
            return;
        }

        const dataToSave = {
            question: qInput.value.trim(),
            correctAnswer: cInput.value.trim(),
            wrongAnswers: wrongs,
            timeLimit: parseInt(timeInput.value) || 60,
            goldReward: parseInt(goldInput.value) || 100
        };

        statusText.textContent = "⏳ Збереження...";
        
        try {
            const docRef = doc(db, "teacher_configs", user.uid);
            
            // Використовуємо merge: true, щоб не стерти налаштування інших рівнів
            await setDoc(docRef, {
                [key]: dataToSave 
            }, { merge: true });

            statusText.textContent = `✅ Збережено для ${topicSel.value} (Lv.${levelSel.value})!`;
            statusText.style.color = "#2ecc71";
            setTimeout(() => statusText.style.color = "#aaa", 3000);

        } catch (e) {
            console.error(e);
            statusText.textContent = "❌ Помилка збереження!";
            statusText.style.color = "#e74c3c";
        }
    };
}

// ==========================================
// 💎 РЕДАКТОР СКАРБНИЦІ (БЕЗ ЗМІН)
// ==========================================
async function renderTreasureEditor() {
    const container = document.getElementById("treasury-content");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header" style="text-align: center;">
            <h2 style="font-size: 2.5em; color: var(--accent-gold);">💎 РЕДАГУВАННЯ ЦІН СКАРБНИЦІ</h2>
            <p>Тут ви можете змінювати ціни на нагороди для учнів.</p>
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
        div.style.cssText = "background: #2c3e50; border: 1px solid #34495e; border-radius: 8px; padding: 10px; margin-bottom: 15px;";

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