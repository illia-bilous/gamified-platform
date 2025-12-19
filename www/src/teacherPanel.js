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

// 👇 ОНОВЛЕНИЙ ІМПОРТ: saveShopItems замість updateItemPriceInDB
import { getShopItems, saveShopItems } from "./shopData.js"; 

// ==========================================
// 🚀 ІНІЦІАЛІЗАЦІЯ ПАНЕЛІ ВЧИТЕЛЯ
// ==========================================
export function initTeacherPanel() {
    console.log("TeacherPanel: Init...");
    const user = getCurrentUser();
    if (!user || user.role !== 'teacher') return;

    const nameEl = document.getElementById("panel-teacher-name");
    const codeEl = document.getElementById("panel-teacher-code");

    if (nameEl) nameEl.textContent = user.name; 
    if (codeEl) codeEl.textContent = user.teacherCode || "Error"; 
   
    // Завантаження блоків
    renderTeacherDashboard("teacher-content"); 

    setTimeout(() => {
        renderTreasureEditor();
    }, 100); 

    setTimeout(() => {
        renderLevelEditor();
    }, 100);
}

// ==========================================
// 📚 МОЇ КЛАСИ ТА ДЕШБОРД
// ==========================================
async function getUniqueClasses(teacherId) {
    const q = query(collection(db, "users"), where("role", "==", "student"), where("teacherUid", "==", teacherId));
    const usersSnapshot = await getDocs(q);
    const classes = new Set(); 
    let studentCount = 0;
    usersSnapshot.forEach(doc => { 
        const data = doc.data(); 
        if (data.className) { 
            classes.add(data.className); 
            studentCount++; 
        } 
    });
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
// 🏆 АНАЛІТИКА ТА ЛІДЕРБОРД КЛАСУ
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
        let rankIcon = `#${index + 1}`;
        if (index === 0) rankIcon = "👑 1";
        else if (index === 1) rankIcon = "🥈 2";
        else if (index === 2) rankIcon = "🥉 3";

        tr.innerHTML = `
            <td class="rank-col" style="font-weight:bold;">${rankIcon}</td>
            <td class="name-col" style="font-size: 1.1em; color: white;">${student.name}</td>
            <td class="gold-col" style="color: #f1c40f; font-weight: bold;">${student.profile?.gold || 0} 💰</td>
            <td class="action-col">
                <button class="btn btn-sm btn-view-profile" data-uid="${student.uid}" style="background: rgba(255,255,255,0.1); border: 1px solid #777;">Профіль</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    setupProfileView(students);
}

// ==========================================
// 👤 КЕРУВАННЯ ПРОФІЛЕМ УЧНЯ
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

    // 1. Підготовка даних (Інвентар)
    const inventory = student.profile?.inventory || [];
    const stackedInventory = inventory.reduce((acc, item) => {
        const itemName = item.name || 'Нагорода';
        acc[itemName] = (acc[itemName] || 0) + 1;
        return acc;
    }, {});

    const inventoryList = Object.keys(stackedInventory).length > 0
        ? Object.keys(stackedInventory).map(name => `
            <div style="background: rgba(44, 62, 80, 0.7); padding: 10px; margin: 8px 0; border-radius: 8px; font-size: 0.9em; text-align: left; color: #ecf0f1; border-left: 4px solid #3498db;">
                ${name} (x${stackedInventory[name]})
            </div>`).join('')
        : '<p style="opacity: 0.5; font-style: italic; padding: 20px;">Нагороди ще не придбані</p>';
        
    const goldDisplay = student.profile?.gold || 0; 

    // 2. HTML Рендер
    container.innerHTML = `
        <div class="student-profile-view" style="color: white; padding: 10px; animation: fadeIn 0.3s ease;">
            
            <button id="btn-back-to-list" class="btn" style="width: 100%; max-width: 600px; display: block; margin: 0 auto 30px; background: #ffffff; color: #2c3e50; font-weight: bold; border: none; padding: 15px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s;">
                ← ПОВЕРНУТИСЯ ДО СПИСКУ
            </button>

            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #f1c40f; margin-bottom: 5px; font-size: 2.8em; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${student.name}</h1>
                <p style="opacity: 0.4; font-size: 1em; letter-spacing: 1px;">ID: ${student.loginID || "N/A"}</p>
            </div>

            <div style="display: flex; gap: 30px; justify-content: center; align-items: flex-start; flex-wrap: wrap;">
                
                <div style="background: #1e1e1e; padding: 30px; border-radius: 20px; width: 300px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #333;">
                    <h3 style="color: #3498db; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <span>📋</span> Основні Дані
                    </h3>
                    <p style="margin: 20px 0; font-size: 1.1em;">🎓 <b>Клас:</b> <span style="color: #3498db;">${student.className}</span></p>
                    <p style="margin: 20px 0; font-size: 1.1em;">🆔 <b>Логін:</b> <span style="color: #3498db;">${student.loginID}</span></p>
                </div>

                <div style="background: #1e1e1e; padding: 30px; border-radius: 20px; width: 340px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #333;">
                    <h3 style="color: #f1c40f; margin-top: 0; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span>💰</span> Баланс Золота
                    </h3>
                    
                    <div style="font-size: 4em; font-weight: bold; color: #f1c40f; margin-bottom: 25px; text-shadow: 0 0 15px rgba(241, 196, 15, 0.4);">
                        ${goldDisplay}
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 35px;">
                        <input type="number" id="gold-input" placeholder="Сума" style="width: 110px; background: #000; color: #f1c40f; border: 2px solid #444; padding: 12px; border-radius: 10px; text-align: center; font-weight: bold; font-size: 1.1em;">
                        <button id="btn-save-gold" class="btn" style="background: #1abc9c; color: white; padding: 12px 20px; border-radius: 10px; font-weight: bold; border: none; cursor: pointer; box-shadow: 0 4px 0 #16a085;">ОНОВИТИ</button>
                    </div>

                    <h3 style="color: #3498db; border-top: 1px solid #333; padding-top: 25px; margin-top: 10px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span>🎁</span> Інвентар
                    </h3>
                    <div id="inventory-container" style="max-height: 250px; overflow-y: auto;">${inventoryList}</div>
                </div>
            </div>
        </div>
    `;

    // 3. ЛОГІКА КНОПОК
    document.getElementById("btn-back-to-list").onclick = () => {
        const teacher = getCurrentUser();
        if (student.className && typeof renderClassLeaderboard === 'function') {
            renderClassLeaderboard(student.className);
        } else {
            renderTeacherDashboard("teacher-content");
        }
    };

    // ОНОВЛЕННЯ ЗОЛОТА
    document.getElementById("btn-save-gold").onclick = async () => {
        const input = document.getElementById("gold-input");
        const newVal = parseInt(input.value);
        
        if (isNaN(newVal) || newVal < 0) {
            alert("⚠️ Будь ласка, введіть число (0 або більше)");
            return;
        }

        try {
            const studentRef = doc(db, "users", student.uid);
            await updateDoc(studentRef, { "profile.gold": newVal });
            alert("✅ Баланс золота успішно змінено!");
            
            const updatedStudent = { ...student };
            if (!updatedStudent.profile) updatedStudent.profile = {};
            updatedStudent.profile.gold = newVal;
            renderStudentProfile(updatedStudent);
        } catch (e) {
            console.error("Firebase Update Error:", e);
            alert("❌ Помилка: не вдалося оновити базу даних.");
        }
    };
}

// ==========================================
// 📝 КОНСТРУКТОР РІВНІВ (UNITY)
// ==========================================
async function renderLevelEditor() {
    const container = document.getElementById("view-tasks"); 
    if (!container) return;

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

            <div id="level-form-area" style="opacity: 0.5; pointer-events: none; transition: opacity 0.3s;">
                <div style="margin-bottom: 20px;">
                    <label style="color: #ccc; display:block; margin-bottom:5px;">Питання на дверях (Формули підтримуються):</label>
                    <input type="text" id="edit-question" placeholder="Напр: 2x + 4 = 10" style="width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #555; color: white;">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="color: #2ecc71; font-weight:bold;">✅ Правильна відповідь:</label>
                    <input type="text" id="edit-correct" placeholder="3" style="width: 100%; padding: 12px; background: #1a1a1a; border: 2px solid #2ecc71; color: white;">
                </div>
                <label style="color: #e74c3c; margin-bottom: 5px; display:block;">❌ Неправильні варіанти (Ключі-пастки):</label>
                <div class="wrong-answers-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 1" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 2" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 3" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                    <input type="text" class="inp-wrong" placeholder="Помилка 4" style="padding: 10px; background: #1a1a1a; border: 1px solid #e74c3c; color: white;">
                </div>
                <div style="background: #2c3e50; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #34495e;">
                    <div style="display: flex; gap: 20px;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.9em; color: #bdc3c7;">⏳ Час (сек):</label>
                            <input type="number" id="edit-time" value="60" style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #555; color: white;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 0.9em; color: #f1c40f;">💰 Нагорода:</label>
                            <input type="number" id="edit-gold" value="100" style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #f1c40f; color: #f1c40f;">
                        </div>
                    </div>
                </div>
                <button id="btn-save-level" class="btn" style="background: #27ae60; width: 100%; font-size: 1.2em; padding: 15px;">💾 ЗБЕРЕГТИ РІВЕНЬ</button>
                <p id="level-save-status" style="text-align: center; color: #aaa; margin-top: 10px; min-height: 20px;"></p>
            </div>
        </div>
    `;
    setupLevelEditorLogic();
}

function setupLevelEditorLogic() {
    const user = getCurrentUser();
    const btnLoad = document.getElementById("btn-load-level");
    const btnSave = document.getElementById("btn-save-level");
    const formArea = document.getElementById("level-form-area");
    const statusText = document.getElementById("level-save-status");
    const qInput = document.getElementById("edit-question");
    const cInput = document.getElementById("edit-correct");
    const wInputs = document.querySelectorAll(".inp-wrong");
    const timeInput = document.getElementById("edit-time");
    const goldInput = document.getElementById("edit-gold");

    // Функція завантаження
    btnLoad.onclick = async () => {
        const topic = document.getElementById("editor-topic").value;
        const levelNum = document.getElementById("editor-level").value;
        statusText.textContent = "⏳ Завантаження...";
        
        try {
            const docSnap = await getDoc(doc(db, "teacher_configs", user.uid));
            if (docSnap.exists() && docSnap.data()[topic]) {
                const topicData = docSnap.data()[topic];
                const levelData = topicData.doors?.find(d => d.id == levelNum);

                if (levelData) {
                    qInput.value = levelData.question;
                    cInput.value = levelData.answer;
                    wInputs.forEach((inp, i) => { inp.value = levelData.wrongAnswers[i] || ""; });
                    goldInput.value = topicData.reward;
                    timeInput.value = topicData.timeLimit;
                    statusText.textContent = "✅ Завантажено!";
                } else {
                    statusText.textContent = "ℹ️ Рівень порожній.";
                }
            } else {
                statusText.textContent = "ℹ️ Тема ще не створена.";
            }
            formArea.style.opacity = "1";
            formArea.style.pointerEvents = "auto";
        } catch (e) { statusText.textContent = "❌ Помилка."; }
    };

    // Функція збереження
    btnSave.onclick = async () => {
        const topic = document.getElementById("editor-topic").value;
        const levelNum = parseInt(document.getElementById("editor-level").value);
        const wrongs = Array.from(wInputs).map(i => i.value.trim()).filter(v => v !== "");

        if(!qInput.value || !cInput.value) return alert("Заповніть питання та відповідь!");

        statusText.textContent = "⏳ Збереження...";

        try {
            const docRef = doc(db, "teacher_configs", user.uid);
            const docSnap = await getDoc(docRef);
            let currentData = docSnap.exists() ? docSnap.data() : {};

            if (!currentData[topic]) {
                currentData[topic] = { 
                    doors: [], 
                    reward: parseInt(goldInput.value) || 100, 
                    timeLimit: parseInt(timeInput.value) || 60 
                };
            }

            const doorData = {
                id: levelNum,
                question: qInput.value.trim(),
                answer: cInput.value.trim(),
                wrongAnswers: wrongs
            };

            const doors = currentData[topic].doors || [];
            const index = doors.findIndex(d => d.id === levelNum);
            
            if (index > -1) {
                doors[index] = doorData;
            } else {
                doors.push(doorData);
            }

            currentData[topic].doors = doors;
            currentData[topic].reward = parseInt(goldInput.value) || 100;
            currentData[topic].timeLimit = parseInt(timeInput.value) || 60;

            await setDoc(docRef, currentData);
            
            statusText.textContent = "✅ Збережено для гри!";
        } catch (e) {
            console.error("Помилка Firebase:", e);
            statusText.textContent = "❌ Помилка збереження.";
        }
    };
}

// ==========================================
// 💎 РЕДАКТОР СКАРБНИЦІ (ПОВНА ВЕРСІЯ)
// ==========================================
async function renderTreasureEditor() {
    const container = document.getElementById("treasury-content");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header" style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: var(--accent-gold); font-size: 2em; margin-bottom: 10px;">💎 Редактор Скарбниці</h2>
            <p style="color: #aaa;">Налаштуйте товари, які зможуть купувати ваші учні.</p>
        </div>
        <div id="treasury-grid-editor" style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
            <div style="color: #777; width: 100%; text-align: center;">⏳ Завантаження магазину...</div>
        </div>
    `;

    const user = getCurrentUser();
    if (!user) return;

    try {
        // Завантажуємо дані САМЕ ЦЬОГО вчителя (або стандартні, якщо пусто)
        const shopData = await getShopItems(user.uid);
        
        const grid = document.getElementById("treasury-grid-editor");
        grid.innerHTML = ""; // Очистити лоадер

        // Функція збереження, яка оновлює загальний об'єкт і відправляє в базу
        const handleSave = async (updatedData) => {
            await saveShopItems(user.uid, updatedData);
        };

        // Рендер трьох колонок
        renderEditableCategory(grid, "Мікро-нагороди", "micro", shopData, handleSave, "#2ecc71");
        renderEditableCategory(grid, "Середні нагороди", "medium", shopData, handleSave, "#3498db");
        renderEditableCategory(grid, "Великі нагороди", "large", shopData, handleSave, "#9b59b6");

    } catch (e) { 
        console.error("Error loading shop:", e);
        container.innerHTML += `<p style="color:red; text-align:center;">Помилка завантаження: ${e.message}</p>`;
    }
}

// Допоміжна функція для рендеру колонки редагування
function renderEditableCategory(parent, title, categoryKey, fullShopData, onSave, color) {
    const col = document.createElement("div");
    col.style.cssText = "flex: 1; min-width: 300px; background: #1a1a1a; padding: 20px; border-radius: 12px; border-top: 5px solid " + color;
    
    col.innerHTML = `<h3 style="color: ${color}; margin-bottom: 15px; text-align: center;">${title}</h3>`;
    
    const list = fullShopData[categoryKey] || [];

    list.forEach((item, index) => {
        const card = document.createElement("div");
        card.style.cssText = "background: #252525; padding: 15px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #333;";
        
        card.innerHTML = `
            <div style="margin-bottom: 10px;">
                <label style="font-size: 0.8em; color: #777; display: block; margin-bottom: 2px;">Назва товару:</label>
                <input type="text" class="inp-name" value="${item.name}" style="width: 100%; padding: 8px; background: #111; color: white; border: 1px solid #444; border-radius: 5px;">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="font-size: 0.8em; color: #777; display: block; margin-bottom: 2px;">Опис:</label>
                <input type="text" class="inp-desc" value="${item.desc}" style="width: 100%; padding: 8px; background: #111; color: #ccc; border: 1px solid #444; border-radius: 5px;">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="width: 45%;">
                    <label style="font-size: 0.8em; color: #f1c40f; display: block; margin-bottom: 2px;">Ціна (💰):</label>
                    <input type="number" class="inp-price" value="${item.price}" style="width: 100%; padding: 8px; background: #111; color: #f1c40f; border: 1px solid #444; border-radius: 5px; font-weight: bold;">
                </div>
                <button class="btn-save-item" style="width: 45%; padding: 8px; background: ${color}; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    💾 Зберегти
                </button>
            </div>
            <div class="save-feedback" style="text-align: center; font-size: 0.8em; margin-top: 5px; height: 1.2em;"></div>
        `;

        const btn = card.querySelector(".btn-save-item");
        const feedback = card.querySelector(".save-feedback");

        btn.onclick = async () => {
            // 1. Збираємо дані з полів
            const newName = card.querySelector(".inp-name").value;
            const newDesc = card.querySelector(".inp-desc").value;
            const newPrice = parseInt(card.querySelector(".inp-price").value);

            if (!newName || isNaN(newPrice)) {
                alert("Назва і ціна обов'язкові!");
                return;
            }

            btn.disabled = true;
            btn.style.opacity = "0.5";
            feedback.textContent = "Збереження...";

            // 2. Оновлюємо локальний об'єкт даних
            fullShopData[categoryKey][index] = {
                id: item.id, // ID не змінюємо
                name: newName,
                desc: newDesc,
                price: newPrice
            };

            // 3. Відправляємо весь об'єкт на збереження
            const success = await onSave(fullShopData);

            if (success) {
                feedback.textContent = "✅ Зміни збережено!";
                feedback.style.color = "#2ecc71";
            } else {
                feedback.textContent = "❌ Помилка!";
                feedback.style.color = "#e74c3c";
            }

            setTimeout(() => {
                btn.disabled = false;
                btn.style.opacity = "1";
                feedback.textContent = "";
            }, 2000);
        };

        col.appendChild(card);
    });

    parent.appendChild(col);
}

// ==========================================
// 📊 АНАЛІТИКА ТА ЖУРНАЛ (НОВИЙ БЛОК)
// ==========================================

// Змінні стану для аналітики
let cachedStudentsForAnalytics = []; 
let expandedStudentId = null; // ID учня, чий журнал відкрито

export async function renderAnalyticsPanel(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Очищаємо контейнер та малюємо "шапку"
    container.innerHTML = `
        <div class="teacher-header">
            <h2>📊 Аналітика Класу</h2>
        </div>
        <div id="analytics-table-container">⏳ Завантаження даних...</div>
        <div id="student-journal-details" style="margin-top: 20px;"></div>
    `;

    const teacher = getCurrentUser();
    if (!teacher) return;

    try {
        // 1. Завантажуємо всіх учнів вчителя
        const q = query(
            collection(db, "users"),
            where("role", "==", "student"),
            where("teacherUid", "==", teacher.uid)
        );

        const querySnapshot = await getDocs(q);
        cachedStudentsForAnalytics = [];
        querySnapshot.forEach((doc) => {
            cachedStudentsForAnalytics.push({ id: doc.id, ...doc.data() });
        });

        // 2. Сортуємо (спочатку за класом, потім за іменем)
        cachedStudentsForAnalytics.sort((a, b) => {
            const classCompare = (a.className || "").localeCompare(b.className || "");
            if (classCompare !== 0) return classCompare;
            return (a.name || "").localeCompare(b.name || "");
        });

        // 3. Малюємо таблицю
        renderAnalyticsTable();

    } catch (error) {
        console.error("Помилка аналітики:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Помилка: ${error.message}</p>`;
    }
}

function renderAnalyticsTable() {
    const container = document.getElementById("analytics-table-container");
    const detailsContainer = document.getElementById("student-journal-details");
    
    if (!container) return;

    // Очищаємо деталі, якщо ніхто не обраний
    if (!expandedStudentId && detailsContainer) {
        detailsContainer.innerHTML = "";
    }

    // 🔥 ЛОГІКА ФОКУСУВАННЯ:
    // Якщо учень обраний -> показуємо тільки його (масив з 1 елемента).
    // Якщо ні -> показуємо всіх.
    const studentsToShow = expandedStudentId 
        ? cachedStudentsForAnalytics.filter(s => s.id === expandedStudentId) 
        : cachedStudentsForAnalytics;

    if (studentsToShow.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#aaa;">Учнів не знайдено.</p>`;
        return;
    }

    let html = `
        <table class="analytics-table" style="width: 100%; border-collapse: collapse; background: #222; border-radius: 8px; overflow: hidden; margin-top: 10px;">
            <thead>
                <tr style="background: #333; color: #ecf0f1; border-bottom: 2px solid #444;">
                    <th style="padding: 12px; text-align: left;">Учень</th>
                    <th style="padding: 12px;">Клас</th>
                    <th style="padding: 12px;">Золото 💰</th>
                    <th style="padding: 12px; text-align: center;">Дії</th>
                </tr>
            </thead>
            <tbody>
    `;

    studentsToShow.forEach(student => {
        const gold = student.profile?.gold || 0;
        const name = student.name || "Без імені";
        const className = student.className || "--";
        const avatar = student.profile?.avatar || 'assets/img/base.png';
        
        // Перевіряємо стан кнопки
        const isExpanded = (student.id === expandedStudentId);

        // Налаштування стилю кнопки
        const btnText = isExpanded ? "✖ Закрити" : "📜 Журнал";
        const btnStyle = isExpanded 
            ? "background: #e74c3c; color: white;" 
            : "background: #f1c40f; color: black;";

        html += `
            <tr style="border-bottom: 1px solid #444;">
                <td style="padding: 12px; display:flex; align-items:center; gap:10px;">
                    <div style="width:35px; height:35px; background:#444; border-radius:50%; overflow:hidden;">
                         <img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <span style="font-size: 1.1em; color: white;">${name}</span>
                </td>
                <td style="padding: 12px; text-align:center; color: #ccc;">${className}</td>
                <td style="padding: 12px; text-align:center; font-weight:bold; color: #f1c40f;">${gold} 💰</td>
                <td style="padding: 12px; text-align: center;">
                    <button class="btn-journal-toggle" 
                            data-id="${student.id}"
                            style="${btnStyle} border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s;">
                        ${btnText}
                    </button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    // Якщо список довгий і ми не в режимі фокусу - додаємо скрол
    if (!expandedStudentId && studentsToShow.length > 5) {
        container.style.maxHeight = "400px";
        container.style.overflowY = "auto";
    } else {
        container.style.maxHeight = "none";
        container.style.overflowY = "visible";
    }

    container.innerHTML = html;

    // Додаємо події кліку на кнопки
    document.querySelectorAll(".btn-journal-toggle").forEach(btn => {
        btn.onclick = () => toggleJournal(btn.dataset.id);
    });

    // Якщо учень активний — малюємо його журнал знизу
    if (expandedStudentId && detailsContainer) {
        renderStudentJournalDetails(expandedStudentId, detailsContainer);
    }
}

function toggleJournal(studentId) {
    if (expandedStudentId === studentId) {
        // Клікнули "Закрити" -> скидаємо вибір
        expandedStudentId = null;
    } else {
        // Клікнули "Журнал" -> обираємо учня
        expandedStudentId = studentId;
    }
    // Перемальовуємо
    renderAnalyticsTable();
}

function renderStudentJournalDetails(studentId, container) {
    const student = cachedStudentsForAnalytics.find(s => s.id === studentId);
    if (!student) return;

    const inventory = student.profile?.inventory || [];
    
    let contentHtml = `
        <div style="background: #1e1e1e; padding: 25px; border-radius: 12px; border: 1px solid #333; animation: slideDown 0.3s ease-out;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #3498db;">🎒 Історія покупок та Інвентар</h3>
                <span style="color: #777; font-size: 0.9em;">Всього предметів: ${inventory.length}</span>
            </div>
    `;

    if (inventory.length === 0) {
        contentHtml += `<p style="color: #777; font-style: italic; text-align: center; padding: 20px;">Журнал покупок порожній.</p>`;
    } else {
        contentHtml += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">`;
        
        // Перевертаємо інвентар, щоб нові були зверху
        [...inventory].reverse().forEach(item => {
            const dateStr = item.date ? new Date(item.date).toLocaleDateString() : "Недавно";
            contentHtml += `
                <div style="background: #2c3e50; padding: 10px; border-radius: 8px; border-left: 3px solid #f1c40f;">
                    <div style="color: #ecf0f1; font-weight: bold;">${item.name}</div>
                    <div style="color: #bdc3c7; font-size: 0.8em; margin-top: 5px;">${dateStr}</div>
                </div>
            `;
        });
        contentHtml += `</div>`;
    }
    
    contentHtml += `</div>`;
    
    // CSS анімація для плавної появи
    const style = document.createElement('style');
    style.innerHTML = `@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(style);

    container.innerHTML = contentHtml;
}

// ==========================================
// 📜 ДЕТАЛЬНИЙ ЖУРНАЛ УЧНЯ
// ==========================================
async function renderStudentJournal(studentId) {
    const detailsContainer = document.getElementById("student-journal-details");
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
        <div style="background: #1e1e1e; padding: 20px; border-radius: 10px; border: 1px solid #444; animation: slideDown 0.3s ease-out;">
            <h3 style="color: #3498db; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px;">
                📜 Історія проходження
            </h3>
            <div id="journal-loader" style="color: #aaa;">⏳ Завантаження даних сесій...</div>
            <div id="journal-list"></div>
        </div>
    `;

    try {
        // Запит до під-колекції 'game_sessions' конкретного учня
        const sessionsRef = collection(db, "users", studentId, "game_sessions");
        // Сортуємо за часом (спочатку нові)
        const q = query(sessionsRef, orderBy("timestamp", "desc"));
        
        const snapshot = await getDocs(q);
        const listContainer = document.getElementById("journal-list");
        document.getElementById("journal-loader").style.display = 'none';

        if (snapshot.empty) {
            listContainer.innerHTML = `<p style="color: #777; font-style: italic;">Учень ще не проходив жодного рівня.</p>`;
            return;
        }

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="color: #888; text-align: left;">
                        <th style="padding: 8px;">Дата</th>
                        <th style="padding: 8px;">Тема / Рівень</th>
                        <th style="padding: 8px;">Результат</th>
                        <th style="padding: 8px;">Час</th>
                        <th style="padding: 8px;">Помилки</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateObj = data.timestamp ? data.timestamp.toDate() : new Date();
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Стилізація результату
            const isWin = data.status === 'win';
            const statusStyle = isWin 
                ? 'color: #2ecc71; font-weight: bold;' 
                : 'color: #e74c3c; font-weight: bold;';
            const statusText = isWin ? '✅ ПЕРЕМОГА' : '❌ ПОРАЗКА';

            tableHtml += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 8px; color: #ccc;">${dateStr}</td>
                    <td style="padding: 8px; color: white;">
                        <span style="color: #3498db;">${data.topic || 'Unknown'}</span> 
                        <span style="color: #777;">(D${data.levelId || '?'})</span>
                    </td>
                    <td style="padding: 8px; ${statusStyle}">${statusText}</td>
                    <td style="padding: 8px; color: #f1c40f;">${data.timeSpent || 0} сек</td>
                    <td style="padding: 8px; color: #e74c3c;">${data.mistakes || 0}</td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;
        listContainer.innerHTML = tableHtml;

    } catch (error) {
        console.error("Error loading journal:", error);
        if(detailsContainer) {
            detailsContainer.innerHTML += `<p style="color: red;">Помилка завантаження історії: ${error.message}</p>`;
        }
    }
}