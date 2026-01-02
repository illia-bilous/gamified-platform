// src/teacherPanel.js

import { db } from "./firebase.js";
import { getCurrentUser } from "./auth.js"; 
// 👇 Всі функції Firestore беремо з одного місця (CDN)
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
    <div class="page-header-container">
        <h2 class="page-header-title">📚 Мої Класи</h2>
        <div class="page-header-line"></div>
        <p class="page-header-description">Керуйте своїми класами та переглядайте успішність учнів.</p>
    </div>

    <div style="text-align: center; margin-bottom: 40px;">
        <div class="teacher-id-badge">
            Ваш ID для учнів: <span>${myDisplayId}</span>
        </div>
    </div>

    <p style="text-align:center; color: #bdc3c7; font-size: 1.2em; margin-bottom: 30px;">
        Всього учнів у вашій групі: <strong style="color: #fff;">${totalStudents}</strong>
    </p>

    <div id="class-cards" class="class-grid"></div>
`;

const grid = document.getElementById("class-cards");

classes.forEach(className => {
    const card = document.createElement("div");
    card.className = "class-card"; 
    
    card.innerHTML = `
        <h3>${className}</h3>
        <p>Переглянути успішність →</p>
    `;
    
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

// ==========================================
// 👤 ОНОВЛЕНИЙ РЕНДЕР ПРОФІЛЮ (Soft Reset + Topic Reset)
// ==========================================
async function renderStudentProfile(student) {
    const container = document.getElementById("teacher-content");
    if (!container) return;

    // --- (Код підготовки інвентаря) ---
    const inventory = student.profile?.inventory || [];
    const stackedInventory = inventory.reduce((acc, item) => {
        const itemName = item.name || 'Нагорода';
        acc[itemName] = (acc[itemName] || 0) + 1;
        return acc;
    }, {});

    const inventoryListHtml = Object.keys(stackedInventory).length > 0
        ? Object.keys(stackedInventory).map(name => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(44, 62, 80, 0.7); padding: 10px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #3498db;">
                <span style="color: #ecf0f1; font-size: 0.9em;">${name} <b style="color: #f1c40f;">(x${stackedInventory[name]})</b></span>
                <button class="btn-delete-reward" data-name="${name}" style="background: #c0392b; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8em; margin-left: 10px;">
                    🗑️ Списати
                </button>
            </div>`).join('')
        : '<p style="opacity: 0.5; font-style: italic; padding: 20px; text-align: center;">Нагороди ще не придбані</p>';
        
    const goldDisplay = student.profile?.gold || 0; 

    // --- HTML ---
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
                
                <div style="display:flex; flex-direction:column; gap: 20px;">
                    <div style="background: #1e1e1e; padding: 30px; border-radius: 20px; width: 300px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #333;">
                        <h3 style="color: #3498db; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                            <span>📋</span> Основні Дані
                        </h3>
                        <p style="margin: 20px 0; font-size: 1.1em;">🎓 <b>Клас:</b> <span style="color: #3498db;">${student.className}</span></p>
                        <p style="margin: 20px 0; font-size: 1.1em;">🆔 <b>Логін:</b> <span style="color: #3498db;">${student.loginID}</span></p>
                    </div>

                    <div style="background: #251e12; padding: 20px; border-radius: 20px; width: 300px; border: 1px solid #e67e22;">
                        <h3 style="color: #e67e22; margin-top: 0; margin-bottom: 15px; font-size: 1.2em;">🎮 Проходження гри</h3>
                        
                        <div style="margin-bottom: 20px; border-bottom: 1px solid #d35400; padding-bottom: 15px;">
                            <p style="color: #aaa; font-size: 0.8em; margin-bottom: 8px;">Скинути прогрес певної теми:</p>
                            
                            <select id="reset-topic-select" style="width: 100%; padding: 10px; background: #000; color: white; border: 1px solid #e67e22; border-radius: 5px; margin-bottom: 10px;">
                                <option value="Fractions">Дроби (Fractions)</option>
                                <option value="Powers">Степені (Powers)</option>
                                <option value="Quadratics">Рівняння (Quadratics)</option>
                            </select>

                            <button id="btn-reset-topic" style="width: 100%; padding: 10px; background: #d35400; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">
                                🔄 СКИНУТИ ТЕМУ
                            </button>
                        </div>

                        <p style="color: #aaa; font-size: 0.8em; margin-bottom: 10px;">
                            Або скинути всі відкриті рівні у всіх темах:
                        </p>
                        <button id="btn-reset-levels" style="width: 100%; padding: 12px; background: #c0392b; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">
                            🔥 СКИНУТИ ВСІ РІВНІ
                        </button>
                    </div>
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
                    <div id="inventory-container" style="max-height: 250px; overflow-y: auto;">
                        ${inventoryListHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- ЛОГІКА КНОПОК ---

    document.getElementById("btn-back-to-list").onclick = () => {
        if (student.className) renderClassLeaderboard(student.className);
        else renderTeacherDashboard("teacher-content");
    };

    // Оновлення золота
    document.getElementById("btn-save-gold").onclick = async () => {
        const input = document.getElementById("gold-input");
        const newVal = parseInt(input.value);
        if (isNaN(newVal) || newVal < 0) return alert("⚠️ Введіть коректне число");

        try {
            await updateDoc(doc(db, "users", student.uid), { "profile.gold": newVal });
            alert("✅ Баланс оновлено!");
            student.profile.gold = newVal;
            renderStudentProfile(student);
        } catch (e) { console.error(e); alert("❌ Помилка"); }
    };

    // 🔥 КНОПКА СКИДАННЯ ВСІХ РІВНІВ
    document.getElementById("btn-reset-levels").onclick = async () => {
        await resetGameLevels(student.uid, student.name);
    };

    // 🔄 КНОПКА СКИДАННЯ КОНКРЕТНОЇ ТЕМИ (НОВА)
    document.getElementById("btn-reset-topic").onclick = async () => {
        const topicSelect = document.getElementById("reset-topic-select");
        const topicID = topicSelect.value;
        const topicName = topicSelect.options[topicSelect.selectedIndex].text;

        const isConfirmed = confirm(`Скинути тему "${topicName}" для учня ${student.name}?\n\nВсі рівні цієї теми заблокуються.`);
        if (!isConfirmed) return;

        try {
            await updateDoc(doc(db, "users", student.uid), { 
                resetTopicCommand: topicID 
            });
            alert(`✅ Команда відправлена! Unity оновить дані при вході.`);
        } catch (error) {
            console.error(error);
            alert("❌ Помилка: " + error.message);
        }
    };

    // Видалення нагород
    container.querySelectorAll('.btn-delete-reward').forEach(btn => {
        btn.onclick = async () => {
            const itemName = btn.dataset.name;
            const success = await removeStudentItem(student.uid, itemName);
            if (success) {
                const idx = student.profile.inventory.findIndex(i => i.name === itemName);
                if (idx !== -1) {
                    student.profile.inventory.splice(idx, 1);
                    renderStudentProfile(student);
                }
            }
        };
    });
}

// ==========================================
// 🎮 ФУНКЦІЯ СКИДАННЯ ВСІХ РІВНІВ
// ==========================================
async function resetGameLevels(studentId, studentName) {
    const isConfirmed = confirm(`Ви хочете закрити ВСІ рівні для учня ${studentName}?\n\nПрогрес всіх тем буде втрачено. Золото та інвентар залишаться.`);
    
    if (!isConfirmed) return;

    try {
        const userRef = doc(db, "users", studentId);
        await updateDoc(userRef, { 
            resetLevelProgress: true 
        });
        alert(`✅ Успішно! Рівні заблоковані.`);
    } catch (error) {
        console.error("Level Reset Error:", error);
        alert("❌ Помилка: " + error.message);
    }
}

// Функція для фізичного видалення предмету з бази даних
async function removeStudentItem(studentId, itemName) {
    if (!confirm(`Ви впевнені, що хочете списати (видалити) "${itemName}"?`)) return false;

    try {
        const studentRef = doc(db, "users", studentId);
        const snapshot = await getDoc(studentRef);
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            let inventory = data.profile.inventory || [];

            const indexToRemove = inventory.findIndex(item => item.name === itemName);

            if (indexToRemove !== -1) {
                inventory.splice(indexToRemove, 1);
                await updateDoc(studentRef, { "profile.inventory": inventory });
                return true; 
            } else {
                alert("Помилка: Цей предмет вже відсутній у базі.");
                return false;
            }
        }
    } catch (e) {
        console.error("Error removing item:", e);
        alert("Помилка списання: " + e.message);
        return false;
    }
}

// ==========================================
// 📝 КОНСТРУКТОР РІВНІВ (UNITY)
// ==========================================
async function renderLevelEditor() {
    const container = document.getElementById("view-tasks"); 
    if (!container) return;

    container.innerHTML = `
        <div class="page-header-container">
            <h2 class="page-header-title">📝 Конструктор Рівнів</h2>
            <div class="page-header-line"></div>
            <p class="page-header-description">Налаштуйте завдання, час та нагороду для кожного рівня.</p>
        </div>

        <div style="max-width: 800px; margin: 0 auto; background: #222; padding: 20px; border-radius: 10px; border: 1px solid #444;">
            <div style="display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap;">
                <select id="editor-topic" style="padding: 10px; border-radius: 5px; background: #333; color: white; border: 1px solid #555;">
                    <option value="Fractions">Тема: Дроби</option>
                    <option value="Powers">Тема: Степені</option>
                    <option value="Equations">Тема: Рівняння</option>
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

    // ==========================================
    // 📥 ЗАВАНТАЖЕННЯ (LOAD)
    // ==========================================
    btnLoad.onclick = async () => {
        const topic = document.getElementById("editor-topic").value;
        const levelNum = document.getElementById("editor-level").value;
        statusText.textContent = "⏳ Завантаження...";
        
        try {
            const docSnap = await getDoc(doc(db, "teacher_configs", user.uid));
            if (docSnap.exists() && docSnap.data()[topic]) {
                const topicData = docSnap.data()[topic];
                
                // Знаходимо конкретний рівень у масиві doors
                // (У Firebase це масив, ми шукаємо по ID)
                let levelData = null;
                if (topicData.doors && Array.isArray(topicData.doors)) {
                    levelData = topicData.doors.find(d => d.id == levelNum);
                }

                if (levelData) {
                    qInput.value = levelData.question || "";
                    cInput.value = levelData.answer || "";
                    wInputs.forEach((inp, i) => { 
                        inp.value = (levelData.wrongAnswers && levelData.wrongAnswers[i]) ? levelData.wrongAnswers[i] : ""; 
                    });
                    
                    // 🔥 ВИПРАВЛЕННЯ: Беремо нагороду та час саме з ЦЬОГО рівня
                    // Якщо в рівні немає, беремо дефолт 100/60
                    goldInput.value = levelData.reward || 100;
                    timeInput.value = levelData.timeLimit || 60;

                    statusText.textContent = "✅ Завантажено!";
                } else {
                    // Якщо рівня ще немає — очищаємо поля
                    qInput.value = "";
                    cInput.value = "";
                    wInputs.forEach(i => i.value = "");
                    goldInput.value = "100";
                    timeInput.value = "60";
                    statusText.textContent = "ℹ️ Новий рівень.";
                }
            } else {
                statusText.textContent = "ℹ️ Тема ще не створена.";
            }
            formArea.style.opacity = "1";
            formArea.style.pointerEvents = "auto";
        } catch (e) { 
            console.error(e);
            statusText.textContent = "❌ Помилка."; 
        }
    };

    // ==========================================
    // 💾 ЗБЕРЕЖЕННЯ (SAVE)
    // ==========================================
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

            // Створюємо тему, якщо її немає
            if (!currentData[topic]) {
                currentData[topic] = { doors: [] };
            }

            // 🔥 ВИПРАВЛЕННЯ: Формуємо об'єкт рівня з reward і timeLimit
            const doorData = {
                id: levelNum,
                question: qInput.value.trim(),
                answer: cInput.value.trim(),
                wrongAnswers: wrongs,
                reward: parseInt(goldInput.value) || 50,      // <--- ТЕПЕР ВОНО ТУТ
                timeLimit: parseInt(timeInput.value) || 120   // <--- І ТУТ
            };

            // Отримуємо поточний масив дверей
            let doors = currentData[topic].doors || [];
            if (!Array.isArray(doors)) doors = []; // Захист від глюків

            // Шукаємо, чи є вже такий рівень, щоб оновити його
            const index = doors.findIndex(d => d.id === levelNum);
            
            if (index > -1) {
                doors[index] = doorData; // Оновлюємо існуючий
            } else {
                doors.push(doorData);    // Додаємо новий
            }

            // Записуємо назад у тему
            currentData[topic].doors = doors;
            
            // (Опціонально) Можна прибрати запис reward у корінь теми, 
            // щоб не плутати базу даних, або залишити як дефолтне значення.
            // Я залишаю це чистим — дані тепер тільки в doors.

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

    const user = getCurrentUser();
    if (!user) return;

    const refreshEditor = async () => {
        container.innerHTML = `
            <div class="page-header-container">
                <h2 class="page-header-title">💎 Редактор Скарбниці</h2>
                <div class="page-header-line"></div>
                <p class="page-header-description">Додавайте та видаляйте нагороди (макс. 10 у категорії).</p>
            </div>

            <div id="treasury-grid-editor" style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; align-items: flex-start;">
                <div style="color: #777; width: 100%; text-align: center;">⏳ Завантаження магазину...</div>
            </div>
        `;

        try {
            const shopData = await getShopItems(user.uid);
            const grid = document.getElementById("treasury-grid-editor");
            grid.innerHTML = ""; 

            const handleSave = async (updatedData) => {
                await saveShopItems(user.uid, updatedData);
            };

            renderEditableCategory(grid, "Мікро-нагороди", "micro", shopData, handleSave, "#2ecc71", refreshEditor);
            renderEditableCategory(grid, "Середні нагороди", "medium", shopData, handleSave, "#3498db", refreshEditor);
            renderEditableCategory(grid, "Великі нагороди", "large", shopData, handleSave, "#9b59b6", refreshEditor);

        } catch (e) {
            console.error("Error loading shop:", e);
            container.innerHTML += `<p style="color:red; text-align:center;">Помилка: ${e.message}</p>`;
        }
    };

    refreshEditor();
}

function renderEditableCategory(parent, title, categoryKey, fullShopData, onSave, color, onRefresh) {
    const col = document.createElement("div");
    col.style.cssText = "flex: 1; min-width: 320px; background: #1a1a1a; padding: 20px; border-radius: 12px; border-top: 5px solid " + color;
    
    if (!fullShopData[categoryKey]) fullShopData[categoryKey] = [];
    const list = fullShopData[categoryKey];

    col.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <h3 style="color: ${color}; margin:0;">${title}</h3>
            <span style="font-size: 0.8em; color: #777;">${list.length}/10</span>
        </div>
    `;
    
    const cardsContainer = document.createElement("div");
    col.appendChild(cardsContainer);

    list.forEach((item, index) => {
        const card = document.createElement("div");
        card.style.cssText = "background: #252525; padding: 15px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #333; position: relative;";
        
        card.innerHTML = `
            <div style="margin-bottom: 10px;">
                <label style="font-size: 0.75em; color: #777;">Назва:</label>
                <input type="text" class="inp-name" value="${item.name}" style="width: 100%; padding: 6px; background: #111; color: white; border: 1px solid #444; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="font-size: 0.75em; color: #777;">Опис:</label>
                <input type="text" class="inp-desc" value="${item.desc}" style="width: 100%; padding: 6px; background: #111; color: #ccc; border: 1px solid #444; border-radius: 4px;">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 10px;">
                <div style="flex-grow: 1;">
                    <label style="font-size: 0.75em; color: #f1c40f;">Ціна:</label>
                    <input type="number" class="inp-price" value="${item.price}" style="width: 100%; padding: 6px; background: #111; color: #f1c40f; border: 1px solid #444; border-radius: 4px; font-weight: bold;">
                </div>
                
                <button class="btn-save" style="padding: 6px 12px; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">💾</button>
                
                <button class="btn-delete" style="padding: 6px 12px; background: #c0392b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">🗑️</button>
            </div>
            <div class="feedback-msg" style="text-align: center; font-size: 0.7em; height: 1em; margin-top: 5px;"></div>
        `;

        card.querySelector(".btn-delete").onclick = async () => {
            if (confirm(`Видалити "${item.name}"?`)) {
                list.splice(index, 1); 
                await onSave(fullShopData); 
                onRefresh(); 
            }
        };

        const btnSave = card.querySelector(".btn-save");
        btnSave.onclick = async () => {
            const newName = card.querySelector(".inp-name").value;
            const newDesc = card.querySelector(".inp-desc").value;
            const newPrice = parseInt(card.querySelector(".inp-price").value);
            const msg = card.querySelector(".feedback-msg");

            if (!newName || isNaN(newPrice)) return alert("Заповніть назву та ціну!");

            btnSave.textContent = "⏳";
            
            list[index] = { ...item, name: newName, desc: newDesc, price: newPrice };
            
            await onSave(fullShopData);
            
            btnSave.textContent = "💾";
            msg.textContent = "Збережено!";
            msg.style.color = "#2ecc71";
            setTimeout(() => msg.textContent = "", 2000);
        };

        cardsContainer.appendChild(card);
    });

    // 2. КНОПКА "ДОДАТИ НОВИЙ"
    if (list.length < 10) {
        const addBtn = document.createElement("button");
        addBtn.innerText = "➕ Додати нагороду";
        addBtn.style.cssText = `width: 100%; padding: 12px; background: transparent; border: 2px dashed ${color}; color: ${color}; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s;`;
        
        addBtn.onmouseover = () => addBtn.style.background = "rgba(255,255,255,0.05)";
        addBtn.onmouseout = () => addBtn.style.background = "transparent";
        
        addBtn.onclick = async () => {
            // Створюємо новий шаблон товару
            // Генеруємо унікальний ID, використовуючи час + випадкове число
            const newId = categoryKey + "_" + Date.now(); 
            
            const newItem = {
                id: newId,
                name: "Нова нагорода",
                desc: "Опис нагороди",
                price: 100
            };

            list.push(newItem); // Додаємо в кінець масиву
            
            addBtn.innerText = "⏳ Додавання...";
            await onSave(fullShopData); // Зберігаємо
            onRefresh(); // Перемальовуємо, щоб з'явилась нова картка
        };

        col.appendChild(addBtn);
    } else {
        // Якщо ліміт досягнуто
        const limitMsg = document.createElement("div");
        limitMsg.innerText = "Максимум 10 нагород досягнуто";
        limitMsg.style.cssText = "text-align: center; color: #555; font-size: 0.9em; padding: 10px; border: 1px dashed #444; border-radius: 8px;";
        col.appendChild(limitMsg);
    }

    parent.appendChild(col);
}

/// ==========================================
// 📊 АНАЛІТИКА ТА ЖУРНАЛ (ФІНАЛЬНА ВЕРСІЯ)
// ==========================================

// Змінні стану
let cachedStudentsForAnalytics = []; 
let expandedStudentId = null; // ID учня, який зараз відкритий

export async function renderAnalyticsPanel(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Малюємо каркас
    container.innerHTML = `
        <div class="teacher-header">
            <h2>📊 Аналітика Класу</h2>
        </div>
        <div id="analytics-table-container">⏳ Завантаження списку учнів...</div>
        <div id="student-journal-details" style="margin-top: 20px;"></div>
    `;

    const teacher = getCurrentUser();
    if (!teacher) return;

    try {
        // 2. Завантажуємо учнів
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

        // Сортування: Клас -> Ім'я
        cachedStudentsForAnalytics.sort((a, b) => {
            const classCompare = (a.className || "").localeCompare(b.className || "");
            if (classCompare !== 0) return classCompare;
            return (a.name || "").localeCompare(b.name || "");
        });

        // 3. Рендеримо таблицю
        renderAnalyticsTable();

    } catch (error) {
        console.error("Помилка:", error);
        container.innerHTML += `<p style="color:red">Помилка завантаження: ${error.message}</p>`;
    }
}

function renderAnalyticsTable() {
    const tableContainer = document.getElementById("analytics-table-container");
    const detailsContainer = document.getElementById("student-journal-details");
    
    if (!tableContainer) return;

    // Якщо список порожній
    if (cachedStudentsForAnalytics.length === 0) {
        tableContainer.innerHTML = `<p style="text-align:center; color:#777;">Учнів не знайдено.</p>`;
        return;
    }

    // 🔥 ФІЛЬТРАЦІЯ: Якщо обрано учня, показуємо тільки його рядок
    const studentsToShow = expandedStudentId 
        ? cachedStudentsForAnalytics.filter(s => s.id === expandedStudentId) 
        : cachedStudentsForAnalytics;

    let html = `
        <table class="analytics-table" style="width: 100%; border-collapse: collapse; background: #222; border-radius: 8px; margin-top: 10px;">
            <thead>
                <tr style="background: #333; color: #ecf0f1;">
                    <th style="padding: 12px; text-align: left;">Учень</th>
                    <th style="padding: 12px;">Клас</th>
                    <th style="padding: 12px;">Золото</th>
                    <th style="padding: 12px; text-align: center;">Дії</th>
                </tr>
            </thead>
            <tbody>
    `;

    studentsToShow.forEach(student => {
        const isExpanded = (student.id === expandedStudentId);
        const btnText = isExpanded ? "✖ Закрити" : "📜 Журнал";
        const btnColor = isExpanded ? "#e74c3c" : "#f1c40f"; // Червоний або Жовтий
        const btnTextColor = isExpanded ? "white" : "black";

        html += `
            <tr style="border-bottom: 1px solid #444;">
                <td style="padding: 12px; font-weight: bold; color: white;">${student.name}</td>
                <td style="padding: 12px; text-align:center; color: #ccc;">${student.className || "-"}</td>
                <td style="padding: 12px; text-align:center; color: #f1c40f;">${student.profile?.gold || 0} 💰</td>
                <td style="padding: 12px; text-align: center;">
                    <button class="btn-toggle-journal" 
                        data-id="${student.id}"
                        style="background: ${btnColor}; color: ${btnTextColor}; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        ${btnText}
                    </button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    // Якщо учня розгорнуто, додаємо кнопку "Показати всіх" (для ясності)
    if (expandedStudentId) {
        html += `<div style="text-align:right; margin-top:5px; font-size:0.8em; color:#777;">Відображається обраний учень</div>`;
    }

    tableContainer.innerHTML = html;

    // === ДОДАЄМО ОБРОБНИКИ ПОДІЙ ===
    document.querySelectorAll('.btn-toggle-journal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const studentId = e.target.getAttribute('data-id');
            handleJournalToggle(studentId);
        });
    });

    // === ЯКЩО УЧЕНЬ ОБРАНИЙ, ЗАВАНТАЖУЄМО ЙОГО ДАНІ ===
    if (expandedStudentId && detailsContainer) {
        // Очищаємо контейнер перед завантаженням (щоб не було дублів)
        detailsContainer.innerHTML = ""; 
        renderStudentJournal(expandedStudentId); // <--- ГОЛОВНИЙ ВИКЛИК
    } else if (detailsContainer) {
        detailsContainer.innerHTML = ""; // Очистити, якщо закрито
    }
}

// Функція перемикання стану
function handleJournalToggle(studentId) {
    if (expandedStudentId === studentId) {
        expandedStudentId = null; // Закрити
    } else {
        expandedStudentId = studentId; // Відкрити
    }
    renderAnalyticsTable(); // Перемалювати
}

// ==========================================
// 📜 ДЕТАЛЬНИЙ ЖУРНАЛ УЧНЯ (ЄДИНА ВЕРСІЯ)
// ==========================================
async function renderStudentJournal(studentId) {
    const detailsContainer = document.getElementById("student-journal-details");
    if (!detailsContainer) return;

    // Скидаємо контейнер і показуємо лоадер
    detailsContainer.innerHTML = `
        <div style="background: #1e1e1e; padding: 20px; border-radius: 10px; border: 1px solid #444; margin-top: 15px;">
            <h3 style="color: #3498db; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px;">
                📜 Детальна історія ігор
            </h3>
            <div id="journal-loader" style="color: #aaa; text-align:center;">⏳ Завантаження даних...</div>
            <div id="journal-list"></div>
        </div>
    `;

    const db = getFirestore();

    try {
        // ! ВАЖЛИВО: Назва колекції має співпадати з saveGameResult
        const sessionsRef = collection(db, "users", studentId, "game_sessions");
        const q = query(sessionsRef, orderBy("timestamp", "desc"));
        
        const snapshot = await getDocs(q);
        const listContainer = document.getElementById("journal-list");
        document.getElementById("journal-loader").style.display = 'none';

        if (snapshot.empty) {
            listContainer.innerHTML = `<p style="color: #777; text-align:center; padding: 20px;">Історія порожня.</p>`;
            return;
        }

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; color: #ddd;">
                <thead>
                    <tr style="border-bottom: 2px solid #444; color: #888; text-align: left;">
                        <th style="padding: 10px;">Дата</th>
                        <th style="padding: 10px;">Тема</th>
                        <th style="padding: 10px;">Результат</th>
                        <th style="padding: 10px;">Час</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snapshot.forEach(doc => {
            const data = doc.data();
            // Красива дата
            const dateObj = data.timestamp ? data.timestamp.toDate() : new Date();
            const dateStr = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) + 
                          ' ' + dateObj.toLocaleTimeString('uk-UA', { hour: '2-digit', minute:'2-digit' });
            
            // Колір балів
            const scoreColor = data.score > 0 ? '#2ecc71' : '#e74c3c'; // Зелений або Червоний

            tableHtml += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 10px; color: #aaa;">${dateStr}</td>
                    <td style="padding: 10px;">
                        <span style="color: white; font-weight:bold;">${data.topic}</span> 
                        <span style="color: #666; font-size: 0.8em;">(Рівень ${data.level})</span>
                    </td>
                    <td style="padding: 10px;">
                        <span style="color: ${scoreColor}; font-weight: bold;">${data.score} 💰</span>
                        ${data.mistakes > 0 ? `<br><span style="font-size:0.75em; color:#e74c3c">${data.mistakes} помилок</span>` : ''}
                    </td>
                    <td style="padding: 10px; color: #f1c40f;">${data.timeSpent || '-'} сек</td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;
        listContainer.innerHTML = tableHtml;

    } catch (error) {
        console.error("Error loading journal:", error);
        detailsContainer.innerHTML += `<p style="color: red;">Помилка: ${error.message}</p>`;
    }
}
