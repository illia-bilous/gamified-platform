import { db } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

export async function loadTeacherAnalytics() {
    const container = document.getElementById("analytics-content");
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;">🔄 Завантаження списку учнів...</p>';

    // 1. Отримуємо поточного вчителя безпечно
    const teacher = getCurrentUser();
    if (!teacher || !teacher.uid) {
        container.innerHTML = `<p style="color:red; text-align:center;">Помилка: Ви не авторизовані як вчитель.</p>`;
        return;
    }

    try {
        const usersRef = collection(db, "users");
        // Беремо тільки студентів цього вчителя
        const q = query(
            usersRef, 
            where("role", "==", "student"),
            where("teacherUid", "==", teacher.uid) 
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = "<p style='text-align:center; padding:20px;'>У учнів ще немає результатів або ви ще не додали учнів.</p>";
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

        snapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const uid = docSnap.id;

            const userClass = user.className || "—";
            const studentLogin = user.loginID || "—";
            
            // Розрахунок золота (враховуємо вкладеність profile)
            let totalGold = 0;
            if (user.profile && user.profile.gold !== undefined) {
                totalGold = Number(user.profile.gold);
            } else if (user.gold !== undefined) {
                totalGold = Number(user.gold);
            }
            if (isNaN(totalGold)) totalGold = 0;

            let avatarSrc = user.profile?.avatar || user.avatar || 'assets/img/base.png';
            if (avatarSrc.includes('assets/avatars/')) {
                avatarSrc = avatarSrc.replace('assets/avatars/', 'assets/img/');
            }

            html += `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;" onerror="this.src='assets/img/base.png'">
                            <b>${user.name || "Без імені"}</b>
                        </div>
                    </td>
                    <td>${userClass}</td>
                    <td><span class="highlight-code">${studentLogin}</span></td>
                    <td style="color: #f1c40f; font-weight: bold;">${totalGold} 💰</td>
                    <td>
                        <button class="btn-details btn-small" data-uid="${uid}" data-name="${user.name}">
                            📜 Журнал
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        
        // Модальне вікно (додаємо в кінець контейнера)
        html += `
            <div id="analytics-modal" class="modal hidden">
                <div class="modal-content large-modal">
                    <div class="modal-header">
                        <h2 id="modal-student-name">Історія</h2>
                        <span class="close-modal">&times;</span>
                    </div>
                    <div id="modal-history-content" class="modal-body">Завантаження...</div>
                </div>
            </div>`;

        container.innerHTML = html;

        // Прив'язка подій до кнопок
        container.querySelectorAll(".btn-details").forEach(btn => {
            btn.onclick = () => {
                const uid = btn.getAttribute("data-uid");
                const name = btn.getAttribute("data-name");
                openStudentHistory(uid, name);
            };
        });

        const modal = document.getElementById("analytics-modal");
        const closeBtn = modal.querySelector(".close-modal");
        closeBtn.onclick = () => modal.classList.add("hidden");

    } catch (error) {
        console.error("Помилка Аналітики:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Помилка завантаження даних.</p>`;
    }
}

// Функція відкриття історії (Журналу)
async function openStudentHistory(uid, name) {
    const modal = document.getElementById("analytics-modal");
    const title = document.getElementById("modal-student-name");
    const content = document.getElementById("modal-history-content");

    modal.classList.remove("hidden");
    title.innerText = `📜 Журнал: ${name}`;
    content.innerHTML = "⏳ Завантаження історії ігор...";

    try {
        const resultsRef = collection(db, "game_results");
        const q = query(
            resultsRef, 
            where("userId", "==", uid), 
            orderBy("timestamp", "desc")
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = "<p>Учень ще не завершив жодного рівня.</p>";
            return;
        }

        let h = `<table class="history-table">
            <thead>
                <tr>
                    <th>Дата</th>
                    <th>Тема</th>
                    <th>Рівень</th>
                    <th>Оцінка</th>
                    <th>Золото</th>
                </tr>
            </thead>
            <tbody>`;

        snapshot.forEach(doc => {
            const res = doc.data();
            const date = res.timestamp?.toDate().toLocaleString('uk-UA') || "—";
            h += `
                <tr>
                    <td>${date}</td>
                    <td>${res.topic || "Дроби"}</td>
                    <td>${res.level || 1}</td>
                    <td style="font-weight:bold; color:#2ecc71;">${res.grade || 0}</td>
                    <td style="color:#f1c40f;">+${res.goldEarned || 0} 💰</td>
                </tr>
            `;
        });
        h += `</tbody></table>`;
        content.innerHTML = h;

    } catch (e) {
        console.error(e);
        content.innerHTML = "Помилка завантаження історії.";
    }
}