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

import { getShopItems, updateItemPriceInDB } from "./shopData.js"; 

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

    // 2. HTML Рендер (Чистий дизайн)
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

    // КНОПКА НАЗАД: Розумне повернення
    document.getElementById("btn-back-to-list").onclick = () => {
        const teacher = getCurrentUser();
        const activeItem = document.querySelector('.menu-item.active');
        const panelType = activeItem ? activeItem.getAttribute('data-panel') : 'classes';

        console.log("Спроба повернення. Клас учня:", student.className);

        // 1. Якщо ми в аналітиці — повертаємося в аналітику
        if (panelType === 'analytics' && typeof loadTeacherAnalytics === 'function') {
            loadTeacherAnalytics();
            return;
        }

        // 2. Якщо ми знаємо клас учня — повертаємося до списку учнів цього класу
        if (student.className && typeof renderClassLeaderboard === 'function') {
            console.log("Повернення до списку учнів класу:", student.className);
            renderClassLeaderboard(student.className);
        } 
        // 3. Якщо клас невідомий — повертаємося до загального списку класів
        else if (typeof renderTeacherClasses === 'function') {
            renderTeacherClasses(teacher.uid);
        } else {
            document.querySelector('[data-panel="classes"]')?.click();
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
            
            // Оновлюємо об'єкт студента локально і перемальовуємо профіль
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
                    <div id="math-validation-msg" style="font-size: 0.9em; margin-top: 5px; height: 1.2em; font-weight: bold;"></div>
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
    const validationMsg = document.getElementById("math-validation-msg");

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
    const topic = document.getElementById("editor-topic").value; // Напр: Fractions
    const levelNum = parseInt(document.getElementById("editor-level").value); // Напр: 1
    const wrongs = Array.from(wInputs).map(i => i.value.trim()).filter(v => v !== "");

    if(!qInput.value || !cInput.value) return alert("Заповніть питання та відповідь!");

    statusText.textContent = "⏳ Збереження...";

    try {
        const docRef = doc(db, "teacher_configs", user.uid);
        const docSnap = await getDoc(docRef);
        let currentData = docSnap.exists() ? docSnap.data() : {};

        // 1. Створюємо структуру теми, якщо її немає
        if (!currentData[topic]) {
            currentData[topic] = { 
                doors: [], 
                reward: parseInt(goldInput.value) || 100, 
                timeLimit: parseInt(timeInput.value) || 60 
            };
        }

        // 2. Готуємо дані для конкретних дверей (рівня)
        const doorData = {
            id: levelNum,
            question: qInput.value.trim(),
            answer: cInput.value.trim(), // Unity шукає саме 'answer'
            wrongAnswers: wrongs
        };

        // 3. Оновлюємо або додаємо рівень у масив
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

        // 4. Зберігаємо весь об'єкт теми
        await setDoc(docRef, currentData);
        
        statusText.textContent = "✅ Збережено для гри!";
        console.log("Дані оновлено для Unity:", currentData[topic]);
    } catch (e) {
        console.error("Помилка Firebase:", e);
        statusText.textContent = "❌ Помилка збереження.";
    }
};
}

// ==========================================
// 💎 РЕДАКТОР СКАРБНИЦІ (ЦІНИ)
// ==========================================
async function renderTreasureEditor() {
    const container = document.getElementById("treasury-content");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header" style="text-align: center;">
            <h2 style="color: var(--accent-gold);">💎 РЕДАГУВАННЯ СКАРБНИЦІ</h2>
        </div>
        <div class="category-grid" style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
            <div class="editor-category-block" style="flex: 1; min-width: 250px; background: #1a1a1a; padding: 15px; border-radius: 10px;">
                <h3 style="color: #2ecc71;">Мікро</h3>
                <div id="teacher-rewards-micro">⏳</div>
            </div>
            <div class="editor-category-block" style="flex: 1; min-width: 250px; background: #1a1a1a; padding: 15px; border-radius: 10px;">
                <h3 style="color: #3498db;">Середні</h3>
                <div id="teacher-rewards-medium">⏳</div>
            </div>
            <div class="editor-category-block" style="flex: 1; min-width: 250px; background: #1a1a1a; padding: 15px; border-radius: 10px;">
                <h3 style="color: #9b59b6;">Великі</h3>
                <div id="teacher-rewards-large">⏳</div>
            </div>
        </div>
    `;

    try {
        const items = await getShopItems(); 
        if (items) {
            renderCategory("teacher-rewards-micro", items.micro || []);
            renderCategory("teacher-rewards-medium", items.medium || []);
            renderCategory("teacher-rewards-large", items.large || []);
        }
    } catch (e) { console.error(e); }
}

function renderCategory(containerId, itemList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ""; 

    itemList.forEach(item => {
        const div = document.createElement("div");
        div.className = "shop-item";
        div.style.cssText = "background: #2c3e50; padding: 10px; margin-bottom: 10px; border-radius: 8px;";
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span style="font-weight: bold;">${item.name}</span>
                <input type="number" id="price-${item.id}" value="${item.price}" style="width: 60px; background: #111; color: #f1c40f; border: none; text-align: center;">
            </div>
            <button class="btn-save-price" style="width: 100%; background: #27ae60; color: white; border: none; padding: 5px; cursor: pointer;">💾 Зберегти</button>
        `;

        const btn = div.querySelector("button");
        btn.onclick = async () => {
            const newPrice = parseInt(document.getElementById(`price-${item.id}`).value);
            btn.disabled = true;
            btn.innerText = "⏳...";
            const success = await updateItemPriceInDB(item.id, newPrice);
            if (success) {
                btn.innerText = "✅";
                setTimeout(() => { btn.innerText = "💾 Зберегти"; btn.disabled = false; }, 2000);
            }
        };
        container.appendChild(div);
    });
}