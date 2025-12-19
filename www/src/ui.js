export function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const screenElement = document.getElementById(id);
    if (screenElement) {
        screenElement.classList.add("active");
    } else {
        console.error(`Екран з ID "${id}" не знайдено.`);
    }
}

export function showToast(text) {
    const t = document.createElement("div");
    t.className = "card";
    t.style.position = "fixed";
    t.style.bottom = "20px";
    t.style.right = "20px";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

export function renderRegisterForm(role) {
    const container = document.getElementById("register-form-content");
    const title = document.getElementById("register-title");
    
    if (!container) return;

    // Змінюємо заголовок
    if (title) {
        title.innerText = (role === 'teacher') ? "РЕЄСТРАЦІЯ ВЧИТЕЛЯ" : "РЕЄСТРАЦІЯ УЧНЯ";
    }

    let html = ``;

    // 1. Спільні поля (Ім'я)
    html += `
        <div class="input-group">
            <label>Прізвище та Ім'я</label>
            <input type="text" id="reg-name" placeholder="Шевченко Тарас">
        </div>
    `;

    // 2. Поля для ВЧИТЕЛЯ
    if (role === 'teacher') {
        html += `
            <div class="input-group">
                <label>Email (Логін)</label>
                <input type="email" id="reg-email" placeholder="email@school.com">
            </div>
            <div class="input-group">
                <label>Пароль</label>
                <input type="password" id="reg-pass" placeholder="******">
            </div>
            
            <div class="input-group" style="border: 1px dashed #f1c40f; padding: 10px; border-radius: 8px; margin-top: 10px;">
                <label style="color: #f1c40f; font-weight:bold;">Код адміністратора:</label>
                <input type="password" id="teacher-key" placeholder="Код від директора" style="background: #222; color: #fff;">
                <small style="color: #aaa; font-size: 0.8em;">Тільки для вчителів школи</small>
            </div>
            `;
    } 
    // 3. Поля для УЧНЯ
    else {
        html += `
            <div class="input-group">
                <label>Клас</label>
                <select id="reg-class">
                    <option value="" disabled selected>Обери клас</option>
                    <option value="5-A">5-A</option>
                    <option value="5-B">5-B</option>
                    <option value="6-A">6-A</option>
                    <option value="6-B">6-B</option>
                </select>
            </div>
            <div class="input-group">
                <label>Пароль</label>
                <input type="password" id="reg-pass" placeholder="******">
            </div>
            <div class="input-group">
                <label>ID Вчителя</label>
                <input type="text" id="reg-student-teacher-id" placeholder="Напр: she_tar_99">
            </div>
        `;
    }

    // 4. Кнопки (Реєстрація + Назад)
    html += `
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="btn-back-reg" class="btn-secondary" style="flex: 1;">НАЗАД</button>
            <button id="register-submit" class="btn-primary" style="flex: 2;">ЗАРЕЄСТРУВАТИСЯ</button>
        </div>
    `;

    // Вставляємо HTML
    container.innerHTML = html;
    container.classList.remove("hidden");

    // 🔥 ЛАГОДИМО КНОПКУ "НАЗАД"
    setTimeout(() => {
        const backBtn = document.getElementById("btn-back-reg");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                // Ховаємо форму реєстрації
                container.classList.add("hidden");
                // Показуємо вибір ролі (якщо він є) або головний екран
                const roleSelect = document.getElementById("role-selection");
                if (roleSelect) roleSelect.classList.remove("hidden");
                else showScreen("start-screen"); // Повертаємось на старт
            });
        }
    }, 100);
}