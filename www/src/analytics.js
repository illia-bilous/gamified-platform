import { db } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

let cachedStudents = [];

function normalizeClass(str) {
    if (!str) return "БЕЗ КЛАСУ";
    return str.toString().trim().replace(/A/g, "А").replace(/B/g, "В").replace(/C/g, "С").replace(/I/g, "І").toUpperCase();
}

// Допоміжна функція часу
function formatTime(seconds) {
    if (!seconds) return "0хв 0с";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}хв ${s}с`;
}

export async function loadTeacherAnalytics() {
    console.log("--- ЗАПУСК АНАЛІТИКИ ---");

    const selectElement = document.getElementById("class-filter-select");
    const tbody = document.getElementById("analytics-tbody");
    
    if (!selectElement || !tbody) return console.error("Елементи HTML не знайдено.");

    selectElement.innerHTML = '<option>🔄 Завантаження...</option>';
    tbody.innerHTML = '';

    const teacher = getCurrentUser();
    if (!teacher || !teacher.uid) {
        selectElement.innerHTML = '<option>Помилка доступу</option>';
        return;
    }

    try {
        const usersRef = collection(db, "users");
        // Шукаємо учнів цього вчителя
        const q = query(usersRef, where("role", "==", "student"), where("teacherUid", "==", teacher.uid));
        
        const snapshot = await getDocs(q);
        console.log(`📊 Знайдено учнів у базі: ${snapshot.size}`);

        cachedStudents = [];
        const classesSet = new Set(); 

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // 🔥 ВАЖЛИВА ЗМІНА:
            // Якщо в документі є поле 'uid' (справжній Auth ID), беремо його. 
            // Якщо ні — беремо ID самого документа.
            data.targetUid = data.uid || docSnap.id; 
            
            // Зберігаємо оригінальний ID документа для відладки
            data.docId = docSnap.id;

            const rawClass = data.className || data.class || "Без класу";
            data._cleanClass = normalizeClass(rawClass);
            data._displayClass = rawClass;

            cachedStudents.push(data);
            classesSet.add(data._cleanClass);
        });

        // Сортування класів
        const sortedClasses = Array.from(classesSet).sort();
        if (sortedClasses.length === 0) {
            selectElement.innerHTML = '<option>Учнів не знайдено</option>';
            return;
        }

        let optionsHtml = `<option value="" disabled selected>-- Оберіть клас --</option>`;
        sortedClasses.forEach(className => optionsHtml += `<option value="${className}">${className}</option>`);
        selectElement.innerHTML = optionsHtml;

        selectElement.onchange = (e) => renderTable(e.target.value);

    } catch (error) {
        console.error("Помилка завантаження:", error);
        selectElement.innerHTML = '<option>Помилка (див. консоль)</option>';
    }
}

function renderTable(selectedCleanClass) {
    const tbody = document.getElementById("analytics-tbody");
    tbody.innerHTML = "";

    const filteredStudents = cachedStudents.filter(s => s._cleanClass === selectedCleanClass);

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Пусто.</td></tr>`;
        return;
    }

    filteredStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    filteredStudents.forEach(user => {
        let totalGold = user.profile?.gold ?? user.gold ?? 0;
        const avatarSrc = (user.profile?.avatar || 'assets/img/base.png').replace('assets/avatars/', 'assets/img/');

        // Передаємо targetUid у функцію
        const row = `
            <tr class="student-main-row">
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                        <b>${user.name}</b>
                    </div>
                </td>
                <td>${user._displayClass}</td>
                <td><span class="highlight-code">${user.loginID || "—"}</span></td>
                <td style="color: #f1c40f;">${totalGold} 💰</td>
                <td style="text-align: center;">
                    <button class="btn-action btn-journal-open" onclick="toggleJournal('${user.targetUid}')">
                        📖 Журнал
                    </button>
                </td>
            </tr>
            <tr id="details-${user.targetUid}" class="details-row" style="display: none;">
                <td colspan="5" style="background: rgba(0,0,0,0.2); padding: 0;">
                    <div id="history-container-${user.targetUid}" style="padding: 20px;"></div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Глобальна функція (щоб HTML її бачив)
window.toggleJournal = async function(targetUid) {
    console.log(`🔎 Відкриваємо журнал для ID: ${targetUid}`);
    
    const detailsRow = document.getElementById(`details-${targetUid}`);
    if (!detailsRow) return console.error(`Елемент details-${targetUid} не знайдено`);

    const isOpening = (detailsRow.style.display === "none");
    document.querySelectorAll('.details-row').forEach(r => r.style.display = 'none');

    if (isOpening) {
        detailsRow.style.display = "table-row";
        const container = document.getElementById(`history-container-${targetUid}`);
        container.innerHTML = '<p style="text-align:center; color:#aaa;">Завантаження історії... ⏳</p>';
        
        try {
            // Спроба 1: З сортуванням (якщо індекс є)
            // ПРИМІТКА: Якщо це не працює, спробуйте прибрати orderBy
            const historyRef = collection(db, "users", targetUid, "game_sessions");
            const q = query(historyRef, orderBy("timestamp", "desc"));
            
            console.log(`📡 Запит до: users/${targetUid}/game_sessions`);
            
            const snapshot = await getDocs(q);
            console.log(`📄 Знайдено записів: ${snapshot.size}`);

            if (snapshot.empty) {
                // ДОДАТКОВА ПЕРЕВІРКА: Може ID не той?
                container.innerHTML = `<p style='text-align:center; color:#aaa;'>
                    Історія порожня.<br>
                    <span style="font-size:0.8em; color:#666;">ID учня: ${targetUid}</span>
                </p>`;
                return;
            }

            let html = `
            <table class="journal-table" style="width:100%; font-size:0.9em; background: rgba(0,0,0,0.3); color: #ccc; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #444; color: #f1c40f;">
                        <th style="padding: 10px;">Дата</th>
                        <th>Тема</th>
                        <th style="text-align:center;">Рівень</th>
                        <th style="text-align:center;">Оцінка</th>
                        <th style="text-align:center;">Золото</th>
                    </tr>
                </thead>
                <tbody>`;
            
            snapshot.forEach(docSnap => {
                const r = docSnap.data();
                let dateStr = r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleString('uk-UA') : "-";
                
                // Колір оцінки
                let gradeColor = r.grade >= 10 ? "#2ecc71" : (r.grade >= 7 ? "#f1c40f" : "#e74c3c");

                html += `
                <tr style="border-bottom: 1px solid #444;">
                    <td style="padding: 8px;">${dateStr}</td>
                    <td>${r.topic || "Unknown"}</td>
                    <td style="text-align: center;">${r.level || 1}</td>
                    <td style="text-align: center; color:${gradeColor}; font-weight:bold;">${r.grade || 0}</td>
                    <td style="text-align: center; color:#f1c40f;">+${r.score || 0}</td>
                </tr>`;
            });
            
            html += "</tbody></table>";
            container.innerHTML = html;

        } catch(e) {
            console.error("❌ Помилка завантаження журналу:", e);
            
            // Якщо помилка про індекс - показуємо це
            if (e.message.includes("index")) {
                container.innerHTML = "<p style='color:orange'>Потрібно створити індекс у Firebase Console (див. консоль).</p>";
            } else {
                container.innerHTML = "<p style='color:red'>Помилка завантаження. Див. консоль.</p>";
            }
        }
    }
};