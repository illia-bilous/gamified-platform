import { db } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

let cachedStudents = [];

// Функція "нормалізації" тексту (щоб А англійська і А українська були однакові)
function normalizeClass(str) {
    if (!str) return "БЕЗ КЛАСУ";
    return str.toString()
        .trim()
        .replace(/A/g, "А") // Eng A -> Ukr А
        .replace(/B/g, "В") // Eng B -> Ukr В
        .replace(/C/g, "С") // Eng C -> Ukr С
        .replace(/I/g, "І") 
        .toUpperCase();
}

export async function loadTeacherAnalytics() {
    console.log("--- ЗАПУСК АНАЛІТИКИ ---");

    // 1. Знаходимо елементи, які ВЖЕ є в твоєму index.html
    const selectElement = document.getElementById("class-filter-select");
    const tbody = document.getElementById("analytics-tbody"); // Увага: в index.html ID саме такий
    
    if (!selectElement || !tbody) {
        console.error("Помилка: Не знайдено елементи таблиці в HTML.");
        return;
    }

    // Показуємо статус завантаження прямо в списку
    selectElement.innerHTML = '<option>🔄 Завантаження даних...</option>';
    tbody.innerHTML = ''; // Чистимо таблицю

    const teacher = getCurrentUser();
    if (!teacher || !teacher.uid) {
        selectElement.innerHTML = '<option>Помилка доступу</option>';
        return;
    }

    try {
        // 2. Завантажуємо учнів з бази
        const usersRef = collection(db, "users");
        const q = query(
            usersRef, 
            where("role", "==", "student"),
            where("teacherUid", "==", teacher.uid)
        );
        
        const snapshot = await getDocs(q);
        console.log(`📊 Знайдено учнів: ${snapshot.size}`);

        cachedStudents = [];
        const classesSet = new Set(); 

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            data.uid = docSnap.id;
            
            // Зберігаємо "чисту" назву класу для фільтрації
            const rawClass = data.className || data.class || "Без класу";
            data._cleanClass = normalizeClass(rawClass);
            data._displayClass = rawClass; // Оригінальна назва (для показу в таблиці)

            cachedStudents.push(data);
            classesSet.add(data._cleanClass);
        });

        // 3. Формуємо випадаючий список АВТОМАТИЧНО
        const sortedClasses = Array.from(classesSet).sort();
        
        if (sortedClasses.length === 0) {
            selectElement.innerHTML = '<option>Учнів не знайдено</option>';
            return;
        }

        let optionsHtml = `<option value="" disabled selected>-- Оберіть клас --</option>`;
        sortedClasses.forEach(className => {
            optionsHtml += `<option value="${className}">${className}</option>`;
        });
        
        selectElement.innerHTML = optionsHtml;

        // 4. Додаємо обробник подій (замість onchange в HTML)
        // Використовуємо .onchange, щоб не накладати купу слухачів при повторному відкритті
        selectElement.onchange = (e) => {
            renderTable(e.target.value);
        };

    } catch (error) {
        console.error("Помилка завантаження:", error);
        selectElement.innerHTML = '<option>Помилка (див. консоль)</option>';
    }
}

function renderTable(selectedCleanClass) {
    const tbody = document.getElementById("analytics-tbody");
    tbody.innerHTML = "";

    // Фільтруємо за нашою "чистою" назвою
    const filteredStudents = cachedStudents.filter(s => s._cleanClass === selectedCleanClass);

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">У цьому класі немає учнів.</td></tr>`;
        return;
    }

    // Сортуємо за алфавітом
    filteredStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    filteredStudents.forEach(user => {
        let totalGold = user.profile?.gold ?? user.gold ?? 0;
        const avatarSrc = (user.profile?.avatar || 'assets/img/base.png').replace('assets/avatars/', 'assets/img/');

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
                <td style="color: #f1c40f; font-weight: bold;">${totalGold} 💰</td>
                <td style="text-align: center;">
                    <button class="btn-action btn-journal-open" onclick="toggleJournal('${user.uid}')">
                        📖 Журнал
                    </button>
                </td>
            </tr>
            <tr id="details-${user.uid}" class="details-row" style="display: none;">
                <td colspan="5" style="background: rgba(0,0,0,0.2); padding: 0;">
                    <div id="history-container-${user.uid}" style="padding: 20px;"></div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Функція відкриття журналу (глобальна)
window.toggleJournal = async function(uid) {
    const detailsRow = document.getElementById(`details-${uid}`);
    const isOpening = (detailsRow.style.display === "none");

    // Закриваємо всі інші
    document.querySelectorAll('.details-row').forEach(r => r.style.display = 'none');

    if (isOpening) {
        detailsRow.style.display = "table-row";
        
        const container = document.getElementById(`history-container-${uid}`);
        container.innerHTML = '<p style="text-align:center; color:#aaa;">Завантаження історії...</p>';
        
        try {
            const q = query(collection(db, "game_results"), where("userId", "==", uid), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                container.innerHTML = "<p style='text-align:center; color:#aaa;'>Історія порожня.</p>";
                return;
            }

            let html = `<table style="width:100%; font-size:0.9em; background: rgba(0,0,0,0.3); color: #ccc;">
                <thead><tr><th>Дата</th><th>Рівень</th><th>Оцінка</th><th>Золото</th></tr></thead><tbody>`;
            
            snapshot.forEach(doc => {
                const r = doc.data();
                const date = r.timestamp?.toDate().toLocaleString('uk-UA') || "-";
                html += `<tr>
                    <td>${date}</td>
                    <td>${r.level || r.topic}</td>
                    <td><b>${r.grade || "-"}</b></td>
                    <td style="color:#f1c40f;">+${r.goldEarned || 0}</td>
                </tr>`;
            });
            html += "</tbody></table>";
            container.innerHTML = html;
        } catch(e) {
            console.error(e);
            container.innerHTML = "<p style='color:red'>Помилка завантаження історії.</p>";
        }
    }
};