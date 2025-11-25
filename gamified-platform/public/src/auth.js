const TEACHER_KEY = "1";

// =========================================================
// 1. РОБОТА З БАЗОЮ ДАНИХ (LocalStorage)
// =========================================================

// Допоміжна функція: завжди бере СВІЖИЙ список користувачів
function getAllUsers() {
    try {
        return JSON.parse(localStorage.getItem("users") || "[]");
    } catch (e) {
        console.error("Помилка читання бази користувачів:", e);
        return [];
    }
}

export const db = {
    // Зберігає весь масив користувачів у LocalStorage
    save(users) {
        localStorage.setItem("users", JSON.stringify(users));
    },

    // Додає нового користувача
    addUser(user) {
        const users = getAllUsers(); // 1. Беремо актуальний список
        user.id = user.id || Date.now();
        users.push(user);            // 2. Додаємо
        this.save(users);            // 3. Зберігаємо
    },

    // Шукає користувача для входу
    findUser(email, pass) {
        const users = getAllUsers(); // ВАЖЛИВО: читаємо свіжі дані перед кожним входом!
        return users.find(u => u.email === email && u.pass === pass);
    },

    // Перевіряє, чи існує email
    emailExists(email) {
        const users = getAllUsers();
        return users.some(u => u.email === email);
    }
};

// Отримує поточного активного користувача (із сесії)
export function getCurrentUser() {
    try {
        const user = localStorage.getItem("currentUser");
        return user ? JSON.parse(user) : null;
    } catch (e) {
        console.error("Помилка парсингу поточного користувача:", e);
        return null;
    }
}

// =========================================================
// 2. UI HELPERS (Обробка помилок у формах)
// =========================================================

function setError(inputEl, message) {
    if (!inputEl) return;
    inputEl.classList.add("input-error");

    let err = inputEl.nextElementSibling;
    if (!err || !err.classList.contains("error-msg")) {
        err = document.createElement("div");
        err.className = "error-msg";
        inputEl.insertAdjacentElement("afterend", err);
    }
    err.textContent = message;
}

function clearError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove("input-error");

    let err = inputEl.nextElementSibling;
    if (err && err.classList.contains("error-msg")) {
        err.remove();
    }
}

function clearAllErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    form.querySelectorAll(".error-msg").forEach(el => el.remove());
}

// =========================================================
// 3. ОСНОВНА ЛОГІКА АУТЕНТИФІКАЦІЇ
// =========================================================

export function initAuth(onLogin) {

    // --- Елементи Реєстрації ---
    const reg_name = document.getElementById("reg-name");
    const reg_email = document.getElementById("reg-email");
    const reg_pass = document.getElementById("reg-pass");
    const teacherKeyInput = document.getElementById("teacher-key");
    const reg_class = document.getElementById("reg-class");
    const regSubmitBtn = document.getElementById("register-submit");
    const regForm = document.getElementById("register-form");
    
    // --- Елементи Входу ---
    const login_email = document.getElementById("login-email");
    const login_pass = document.getElementById("login-pass");
    const loginSubmitBtn = document.getElementById("login-submit");
    const loginForm = document.getElementById("login-form");

    // --- Інше ---
    const successDiv = document.getElementById("register-success");
    const regFormContent = document.getElementById("register-form-content");

    // ------------------------------------
    // Логіка Кнопки "Зареєструватися"
    // ------------------------------------
    if (regSubmitBtn) {
        regSubmitBtn.addEventListener('click', () => {
            if (!regForm) return;

            // Скидаємо помилки
            clearAllErrors("register-form");

            // Перевірка наявності елементів
            if (!reg_name || !reg_email || !reg_pass || !teacherKeyInput || !reg_class) {
                console.error("Auth Error: Не знайдено поля форми реєстрації.");
                return;
            }

            const name = reg_name.value.trim();
            const email = reg_email.value.trim();
            const pass = reg_pass.value.trim();

            let valid = true;

            // Визначаємо роль: якщо поле ключа видиме - це вчитель
            const isTeacherView = !document.getElementById("register-teacher-key")?.classList.contains("hidden");
            const role = isTeacherView ? "teacher" : "student";
            let className = null;

            // Валідація
            if (name.length < 2) {
                setError(reg_name, "Імʼя повинно містити мінімум 2 символи.");
                valid = false;
            }

            if (!email.includes("@") || !email.includes(".")) {
                setError(reg_email, "Введіть коректний email.");
                valid = false;
            } else if (db.emailExists(email)) {
                setError(reg_email, "Користувач з таким email вже існує.");
                valid = false;
            }

            if (pass.length < 6) {
                setError(reg_pass, "Пароль має містити не менше 6 символів.");
                valid = false;
            }

            if (role === "teacher") {
                const key = teacherKeyInput.value.trim();
                if (key !== TEACHER_KEY) {
                    setError(teacherKeyInput, "Невірний код доступу викладача!");
                    valid = false;
                }
            } else {
                className = reg_class.value;
                if (!className) {
                    setError(reg_class, "Оберіть ваш клас.");
                    valid = false;
                }
            }

            if (!valid) return;

            // Створення об'єкта нового користувача
            const newUser = {
                id: Date.now(),
                name,
                email,
                pass,
                role,
                className,
                profile: {
                    gold: 0, // Стартове золото 0 (бонус нарахується в studentPanel.js)
                    inventory: [],
                    achievements: [],
                    welcomeBonusReceived: false // Прапорець для логіки бонусу
                }
            };

            db.addUser(newUser);
            console.log(`Auth: Успішна реєстрація: ${newUser.email}`);

            // Успіх
            regFormContent?.classList.add("hidden");
            successDiv?.classList.remove("hidden");

            // Очистка полів
            reg_name.value = "";
            reg_email.value = "";
            reg_pass.value = "";
            teacherKeyInput.value = "";
        });
    }

    // Кнопка "Перейти до входу" після реєстрації
    document.getElementById("btn-go-to-login")?.addEventListener('click', () => {
        regFormContent?.classList.remove("hidden");
        successDiv?.classList.add("hidden");
        // Це спрацює, якщо router.js слухає клік на цю кнопку, 
        // але для надійності можна викликати клік на "Вхід" в меню
        document.getElementById("btn-login")?.click(); 
    });

    // ------------------------------------
    // Логіка Кнопки "Увійти"
    // ------------------------------------
    if (loginSubmitBtn) {
        loginSubmitBtn.addEventListener('click', () => {
            if (!loginForm) return;

            clearAllErrors("login-form");
            
            if (!login_email || !login_pass) return;

            const email = login_email.value.trim();
            const pass = login_pass.value.trim();

            let valid = true;
            if (!email) { setError(login_email, "Введіть email."); valid = false; }
            if (!pass) { setError(login_pass, "Введіть пароль."); valid = false; }

            if (!valid) return;

            // ТУТ ГОЛОВНА ЗМІНА: findUser тепер читає найсвіжіші дані з localStorage
            const user = db.findUser(email, pass);

            if (!user) {
                setError(login_email, "Невірний логін або пароль");
                clearError(login_pass); 
                return;
            }

            // Зберігаємо свіжого користувача в сесію
            localStorage.setItem("currentUser", JSON.stringify(user));
            console.log(`Auth: Успішний вхід: ${user.email}`);

            // Очистка полів
            login_email.value = "";
            login_pass.value = "";

            // Перехід далі
            onLogin(user.role);
        });
    }
}