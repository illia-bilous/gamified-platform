// src/auth.js
import { auth, db } from "./firebase.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc,
    collection, // 🔥 Не забудь ці імпорти для пошуку вчителя
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TEACHER_KEY = "1"; // Код адміністратора для реєстрації вчителів
const STUDENT_DOMAIN = "@math.maze"; // 🔥 Технічний домен для логінів

// --- ДОПОМІЖНА: Транслітерація (Перші 3 букви) ---
// Робить з "Шевченко" -> "she"
function getShortTranslit(word) {
    if(!word) return "xxx";
    const a = {"а":"a", "б":"b", "в":"v", "г":"h", "ґ":"g", "д":"d", "е":"e", "є":"ie", "ж":"zh", "з":"z", "и":"y", "і":"i", "ї":"i", "й":"i", "к":"k", "л":"l", "м":"m", "н":"n", "о":"o", "п":"p", "р":"r", "с":"s", "т":"t", "у":"u", "ф":"f", "х":"kh", "ц":"ts", "ч":"ch", "ш":"sh", "щ":"shch", "ь":"", "ю":"iu", "я":"ia"};
    
    const transliterated = word.toLowerCase().split('').map(c => a[c] || c).join('').replace(/[^a-z0-9]/g, '');
    return transliterated.substring(0, 3);
}

export function getCurrentUser() {
    try {
        const user = localStorage.getItem("currentUser");
        return user ? JSON.parse(user) : null;
    } catch (e) { return null; }
}

export function logoutUser() {
    localStorage.removeItem("currentUser");
    signOut(auth).then(() => console.log("Out")).catch((e) => console.error(e));
}

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

function clearAllErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    form.querySelectorAll(".error-msg").forEach(el => el.remove());
}

export function initAuth(onLoginSuccess) {
    const regSubmitBtn = document.getElementById("register-submit");
    const loginSubmitBtn = document.getElementById("login-submit");

    // 1. ОБРОБКА РЕЄСТРАЦІЇ
    if (regSubmitBtn) {
        const newBtn = regSubmitBtn.cloneNode(true);
        regSubmitBtn.parentNode.replaceChild(newBtn, regSubmitBtn);

        newBtn.addEventListener('click', async () => {
            clearAllErrors("register-form");

            const nameEl = document.getElementById("reg-name");
            const emailEl = document.getElementById("reg-email");
            const passEl = document.getElementById("reg-pass");
            const classEl = document.getElementById("reg-class");
            const teacherKeyEl = document.getElementById("teacher-key"); // Адмін-ключ (для вчителя)
            const studentTeacherIdEl = document.getElementById("reg-student-teacher-id"); // Код вчителя (для учня)

            const nameFull = nameEl.value.trim();
            const pass = passEl.value.trim();
            const role = localStorage.getItem("selectedRole") || "student";
            
            let finalEmail = "";
            let loginToDisplay = "";
            let generatedTeacherCode = null; // Код, який отримає вчитель
            let linkedTeacherUid = null;     // UID вчителя, до якого прив'яжеться учень
            
            let hasError = false;

            if (nameFull.split(" ").length < 2) { setError(nameEl, "Введіть Прізвище та Ім'я"); hasError = true; }
            if (pass.length < 6) { setError(passEl, "Пароль мін. 6 символів"); hasError = true; }

            // --- ЛОГІКА ВЧИТЕЛЯ ---
            if (role === "teacher") {
                finalEmail = emailEl.value.trim();
                loginToDisplay = finalEmail;
                
                if (!finalEmail.includes("@")) { setError(emailEl, "Некоректний email"); hasError = true; }
                if (teacherKeyEl.value.trim() !== TEACHER_KEY) { setError(teacherKeyEl, "Невірний ключ адміністратора!"); hasError = true; }
                
                if (!hasError) {
                    // Генеруємо TeacherID: прізв(3)_ім(3)_код (напр. she_tar_99)
                    const parts = nameFull.split(" ");
                    const surname = parts[0]; 
                    const firstName = parts[1] || "";
                    const rnd = Math.floor(10 + Math.random() * 90); // 2 цифри
                    generatedTeacherCode = `${getShortTranslit(surname)}_${getShortTranslit(firstName)}_${rnd}`;
                }
            } 
            
            // --- ЛОГІКА УЧНЯ ---
            else {
                if (!classEl.value) { setError(classEl, "Оберіть клас"); hasError = true; }
                
                const tCodeInput = studentTeacherIdEl.value.trim();
                if (tCodeInput.length < 5) { setError(studentTeacherIdEl, "Введіть ID вчителя (напр. she_tar_99)"); hasError = true; }
                
                if (!hasError) {
                    // 🔥 Шукаємо вчителя за коротким кодом
                    try {
                        const q = query(collection(db, "users"), where("teacherCode", "==", tCodeInput), where("role", "==", "teacher"));
                        const querySnapshot = await getDocs(q);
                        
                        if (querySnapshot.empty) {
                            setError(studentTeacherIdEl, "Вчителя з таким ID не знайдено!");
                            return; 
                        } else {
                            const teacherDoc = querySnapshot.docs[0];
                            linkedTeacherUid = teacherDoc.id; // Зберігаємо справжній UID
                        }
                    } catch (e) {
                        console.error(e);
                        alert("Помилка перевірки вчителя");
                        return;
                    }

                    // Генеруємо логін учня: прізв(3)_ім(3)_код
                    const parts = nameFull.split(" ");
                    const surname = parts[0];
                    const firstName = parts[1] || "";
                    const rnd = Math.floor(10 + Math.random() * 90);
                    
                    const loginID = `${getShortTranslit(surname)}_${getShortTranslit(firstName)}_${rnd}`;
                    
                    loginToDisplay = loginID;
                    finalEmail = `${loginID}${STUDENT_DOMAIN}`; // Додаємо @math.maze
                }
            }

            if (hasError) return;

            // --- СТВОРЕННЯ В FIREBASE ---
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, pass);
                const user = userCredential.user;

                const newUserData = {
                    uid: user.uid,
                    name: nameFull,
                    email: finalEmail,
                    role: role,
                    className: role === "student" ? classEl.value : "Teacher",
                    
                    teacherCode: generatedTeacherCode, // Тільки для вчителя
                    teacherUid: linkedTeacherUid,      // Тільки для учня
                    
                    loginID: loginToDisplay,
                    profile: { gold: 2500, inventory: [], welcomeBonusReceived: true, avatar: 'assets/img/base.png' },
                    createdAt: new Date().toISOString()
                };

                await setDoc(doc(db, "users", user.uid), newUserData);

                console.log("✅ Успіх:", loginToDisplay);
                
                document.getElementById("register-form-content").classList.add("hidden");
                const successDiv = document.getElementById("register-success");
                successDiv.classList.remove("hidden");
                
                const successTitle = successDiv.querySelector("h3");
                const successDesc = document.getElementById("new-login-display");

                if(role === "teacher") {
                    successTitle.textContent = "Ви зареєстровані!";
                    successDesc.style.display = "block";
                    successDesc.innerHTML = `
                        <p style="color:#aaa;">Ваш ID для учнів:</p>
                        <h2 style="color:#f1c40f; font-family:monospace; font-size: 2em;">${generatedTeacherCode}</h2>
                        <p style="color:#fff;">Передайте цей код учням, щоб вони приєдналися до вас.</p>
                    `;
                } else {
                    successTitle.textContent = "Реєстрація успішна!";
                    successDesc.style.display = "block";
                    successDesc.innerHTML = `
                        <p style="color:#aaa;">Твій ЛОГІН для входу:</p>
                        <h2 style="color:#fff; font-family:monospace; font-size: 2em;">${loginToDisplay}</h2>
                        <p style="color:#f1c40f;">⚠️ Запиши його! Пароль ти знаєш.</p>
                    `;
                }

            } catch (error) {
                console.error("Reg Error:", error);
                if (error.code === 'auth/email-already-in-use') {
                    alert("Такий користувач вже існує! Спробуйте ще раз.");
                } else {
                    alert("Помилка: " + error.message);
                }
            }
        });
    }

    // 2. ВХІД
    if (loginSubmitBtn) {
        const newLoginBtn = loginSubmitBtn.cloneNode(true);
        loginSubmitBtn.parentNode.replaceChild(newLoginBtn, loginSubmitBtn);

        newLoginBtn.addEventListener('click', async () => {
            clearAllErrors("login-form");

            const emailEl = document.getElementById("login-email");
            const passEl = document.getElementById("login-pass");
            let inputLogin = emailEl.value.trim();
            const pass = passEl.value.trim();
            
            // Валідація пустих полів
            let hasEmpty = false;
            if (!inputLogin) { setError(emailEl, "Введіть логін або email"); hasEmpty = true; }
            if (!pass) { setError(passEl, "Введіть пароль"); hasEmpty = true; }
            if (hasEmpty) return;

            // Авто-додавання домену
            if (!inputLogin.includes("@")) {
                inputLogin = inputLogin + STUDENT_DOMAIN;
            }

            try {
                const userCredential = await signInWithEmailAndPassword(auth, inputLogin, pass);
                const uid = userCredential.user.uid;
                const userDoc = await getDoc(doc(db, "users", uid));

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    localStorage.setItem("currentUser", JSON.stringify(userData));
                    emailEl.value = "";
                    passEl.value = "";
                    onLoginSuccess(userData.role);
                } else {
                    // Якщо в Auth є, а в базі Firestore немає
                    setError(emailEl, "Помилка профілю. Зверніться до вчителя.");
                }
            } catch (error) {
                console.error("Login Error:", error.code);
                
                // 🔥 РОЗУМНА ОБРОБКА ПОМИЛОК 🔥
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    // Підсвічуємо ОБИДВА поля, бо ми не знаємо точно, що не так (безпека)
                    setError(emailEl, "Невірний логін...");
                    setError(passEl, "...або пароль");
                } 
                else if (error.code === 'auth/invalid-email') {
                    setError(emailEl, "Некоректний формат логіна/пошти");
                } 
                else if (error.code === 'auth/too-many-requests') {
                    setError(passEl, "Забагато спроб. Спробуйте пізніше.");
                } 
                else {
                    setError(emailEl, "Помилка входу: " + error.message);
                }
            }
        });

        // ==========================================
// 🔙 ЛОГІКА КНОПКИ "НАЗАД" (ПРИ РЕЄСТРАЦІЇ)
// ==========================================
function setupBackButton() {
    // 1. Знаходимо всі кнопки, які можуть бути "Назад"
    // (Шукаємо по ID "btn-back" або по класу "btn-back")
    const backButtons = document.querySelectorAll('#btn-back, .btn-back');

    backButtons.forEach(btn => {
        // Видаляємо старі події (на випадок дублювання), клонуючи кнопку
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Щоб не перезавантажувало сторінку
            console.log("🔙 Натиснуто кнопку НАЗАД");

            // 2. Ховаємо всі форми реєстрації
            const regTeacher = document.getElementById('register-teacher-block'); // Перевірте, чи такий ID у блоку вчителя
            const regStudent = document.getElementById('register-student-block'); // Перевірте, чи такий ID у блоку учня
            
            if (regTeacher) regTeacher.classList.add('hidden');
            if (regStudent) regStudent.classList.add('hidden');

            // 3. Показуємо екран вибору (або входу)
            const roleSelect = document.getElementById('role-selection-block'); // Блок з кнопками "Я Вчитель / Я Учень"
            const loginBlock = document.getElementById('login-block'); // Або блок входу
            
            // Логіка: якщо є вибір ролі - показуємо його, якщо ні - то екран входу
            if (roleSelect) {
                roleSelect.classList.remove('hidden');
            } else if (loginBlock) {
                loginBlock.classList.remove('hidden');
            }
        });
    });
}

// 👇 НЕ ЗАБУДЬТЕ ВИКЛИКАТИ ЦЮ ФУНКЦІЮ ПРИ ЗАВАНТАЖЕННІ СТОРІНКИ
document.addEventListener('DOMContentLoaded', () => {
    setupBackButton();
});
    }

    const goToLoginBtn = document.getElementById("btn-go-to-login");
    if (goToLoginBtn) {
        const newGoBtn = goToLoginBtn.cloneNode(true);
        goToLoginBtn.parentNode.replaceChild(newGoBtn, goToLoginBtn);
        newGoBtn.addEventListener('click', () => {
             document.getElementById("register-form-content")?.classList.remove("hidden");
             document.getElementById("register-success")?.classList.add("hidden");
             document.getElementById("btn-login")?.click();
        });
    }
}

export function renderRegisterForm(role) {
    const isStudent = role === "student";

    // Змінюємо заголовок
    const regTitle = document.querySelector("#screen-register h2");
    if (regTitle) regTitle.innerText = isStudent ? "Реєстрація Учня" : "Реєстрація Вчителя";

    // Допоміжна функція для ховання/показу
    const setVisible = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", !visible);
    };

    // 1. Поля для учня
    setVisible("select-class-wrapper", isStudent);      // Вибір класу
    setVisible("student-teacher-id-block", isStudent);  // Поле "Код вчителя"

    // 2. Поля для вчителя
    setVisible("email-field-group", !isStudent);        // Email
    setVisible("teacher-key-block", !isStudent);        // Код адміністратора (TEACHER_KEY)
}