import { db } from "./firebase.js";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function loadTeacherAnalytics() {
    const container = document.getElementById("analytics-content");
    container.innerHTML = '<p style="text-align:center;">🔄 Завантаження списку учнів...</p>';

    try {
        const usersRef = collection(db, "users");
        // Беремо тільки студентів
        const q = query(usersRef, where("role", "==", "student"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = "<p style='text-align:center; padding:20px;'>Учнів не знайдено.</p>";
            return;
        }

        let html = `
            <table class="analytics-table">
                <thead>
                    <tr>
                        <th>Учень</th>
                        <th>Клас</th>
                        <th>Логін (ID)</th>
                        <th>Загальне Золото 💰</th>
                        <th>Дії</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snapshot.forEach((doc) => {
            const user = doc.data();
            const uid = doc.id;

            // 1. ПРАВИЛЬНИЙ ПОШУК КЛАСУ (з auth.js: className)
            const userClass = user.className || "—";
            
            // 2. ПРАВИЛЬНИЙ ПОШУК ЛОГІНУ (з auth.js: loginID)
            const studentLogin = user.loginID || "—";
            
            // 3. ПРАВИЛЬНИЙ ПОШУК ЗОЛОТА (з auth.js: profile.gold)
            let totalGold = 0;
            if (user.profile && user.profile.gold !== undefined) {
                totalGold = user.profile.gold;
            } else if (user.gold !== undefined) {
                // На випадок старих акаунтів
                totalGold = user.gold;
            }

            // Аватар теж беремо з профілю
            let avatarSrc = 'assets/img/base.png';
            if (user.profile && user.profile.avatar) {
                avatarSrc = user.profile.avatar;
            } else if (user.avatar) {
                avatarSrc = user.avatar;
            }

            // Фікс шляху аватара (якщо в базі старий шлях)
            if (avatarSrc.includes('assets/avatars/')) {
                avatarSrc = avatarSrc.replace('assets/avatars/', 'assets/img/');
            }

            html += `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                            <b>${user.name || "Без імені"}</b>
                        </div>
                    </td>
                    <td>${userClass}</td>
                    <td><span class="highlight-code">${studentLogin}</span></td>
                    <td style="color: #f1c40f; font-weight: bold;">${totalGold}</td>
                    <td>
                        <button class="btn-details" data-uid="${uid}" data-name="${user.name}">
                            📜 Журнал
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        
        // Модальне вікно для історії
        html += `
            <div id="analytics-modal" class="modal hidden">
                <div class="modal-content large-modal">
                    <span class="close-modal">&times;</span>
                    <h2 id="modal-student-name">Історія</h2>
                    <div id="modal-history-content">Завантаження...</div>
                </div>
            </div>`;

        container.innerHTML = html;

        // Логіка кнопок "Журнал"
        document.querySelectorAll(".btn-details").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const uid = e.target.getAttribute("data-uid");
                const name = e.target.getAttribute("data-name");
                openStudentHistory(uid, name);
            });
        });

        // Закриття модального вікна
        const modal = document.getElementById("analytics-modal");
        const closeBtn = modal.querySelector(".close-modal");
        
        closeBtn.onclick = () => modal.classList.add("hidden");
        window.onclick = (event) => {
            if (event.target == modal) modal.classList.add("hidden");
        };

    } catch (error) {
        console.error("Помилка:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Помилка: ${error.message}</p>`;
    }
}

// Функція відкриття історії (Оцінки)
async function openStudentHistory(studentId, studentName) {
    const modal = document.getElementById("analytics-modal");
    const contentDiv = document.getElementById("modal-history-content");
    
    document.getElementById("modal-student-name").innerText = `Журнал: ${studentName}`;
    modal.classList.remove("hidden");
    contentDiv.innerHTML = "Завантаження...";

    try {
        const historyRef = collection(db, "game_results");
        // Сортуємо від нових до старих
        const q = query(historyRef, where("userId", "==", studentId), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contentDiv.innerHTML = "<p>Учень ще не проходив уроки.</p>";
            return;
        }

        let tableHtml = `
            <table class="history-table" style="width:100%; border-collapse: collapse;">
                <thead style="background:#333; color:white;">
                    <tr>
                        <th style="padding:8px;">Тема</th>
                        <th style="padding:8px;">Рівень</th>
                        <th style="padding:8px;">Дата</th>
                        <th style="padding:8px;">Час</th>
                        <th style="padding:8px;">Оцінка</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString('uk-UA') : "—";
            
            // Виводимо оцінку або зірки
            let displayGrade = data.grade ? data.grade : (data.stars ? data.stars + "⭐" : "-");
            
            // Фарбуємо оцінку
            let color = "white";
            if (typeof displayGrade === 'number') {
                if(displayGrade >= 10) color = "#2ecc71";      // Зелений (10-12)
                else if(displayGrade >= 7) color = "#f1c40f"; // Жовтий (7-9)
                else color = "#e74c3c";                       // Червоний (1-6)
            }

            tableHtml += `
                <tr style="border-bottom:1px solid #444;">
                    <td style="padding:8px;">${data.topic || "Math"}</td>
                    <td style="padding:8px; text-align:center;">${data.level}</td>
                    <td style="padding:8px; font-size:0.85em; color:#ccc;">${date}</td>
                    <td style="padding:8px; text-align:center;">${data.time || "--"} с</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">
                        ${displayGrade}
                    </td>
                </tr>
            `;
        });

        tableHtml += "</tbody></table>";
        contentDiv.innerHTML = tableHtml;

    } catch (e) {
        console.error(e);
        if (e.message.includes("index")) {
             contentDiv.innerHTML = `<p style="color:orange">⚠️ Потрібно створити індекс у Firebase (посилання в консолі F12).</p>`;
        } else {
             contentDiv.innerHTML = `<p style="color:red">Помилка історії: ${e.message}</p>`;
        }
    }
}