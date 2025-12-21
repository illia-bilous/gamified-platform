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

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // Запобігаємо стандартній поведінці форми

            // --- 🔥 БЛОКУВАННЯ КНОПКИ (Початок) ---
            newBtn.disabled = true;
            const originalText = newBtn.innerText;
            newBtn.innerText = "⏳ Обробка...";
            newBtn.style.opacity = "0.6";
            newBtn.style.cursor = "not-allowed";
            // ---------------------------------------

            clearAllErrors("register-form");

            const nameEl = document.getElementById("reg-name");
            const emailEl = document.getElementById("reg-email");
            const passEl = document.getElementById("reg-pass");
            const classEl = document.getElementById("reg-class");
            const teacherKeyEl = document.getElementById("teacher-key");
            const studentTeacherIdEl = document.getElementById("reg-student-teacher-id");

            const nameFull = nameEl.value.trim();
            const pass = passEl.value.trim();
            const role = localStorage.getItem("selectedRole") || "student";
            
            let finalEmail = "";
            let loginToDisplay = "";
            let generatedTeacherCode = null;
            let linkedTeacherUid = null;
            
            let hasError = false;

            // Функція для розблокування кнопки при помилці валідації
            const unlockButton = () => {
                newBtn.disabled = false;
                newBtn.innerText = originalText;
                newBtn.style.opacity = "1";
                newBtn.style.cursor = "pointer";
            };

            if (nameFull.split(" ").length < 2) { setError(nameEl, "Введіть Прізвище та Ім'я"); hasError = true; }
            if (pass.length < 6) { setError(passEl, "Пароль мін. 6 символів"); hasError = true; }

            // --- ЛОГІКА ВЧИТЕЛЯ ---
            if (role === "teacher") {
                finalEmail = emailEl.value.trim();
                loginToDisplay = finalEmail;
                
                if (!finalEmail.includes("@")) { setError(emailEl, "Некоректний email"); hasError = true; }
                if (teacherKeyEl.value.trim() !== TEACHER_KEY) { setError(teacherKeyEl, "Невірний ключ адміністратора!"); hasError = true; }
                
                if (!hasError) {
                    const parts = nameFull.split(" ");
                    const surname = parts[0]; 
                    const firstName = parts[1] || "";
                    const rnd = Math.floor(10 + Math.random() * 90);
                    generatedTeacherCode = `${getShortTranslit(surname)}_${getShortTranslit(firstName)}_${rnd}`;
                }
            } 
            
            // --- ЛОГІКА УЧНЯ ---
            else {
                if (!classEl.value) { setError(classEl, "Оберіть клас"); hasError = true; }
                
                const tCodeInput = studentTeacherIdEl.value.trim();
                if (tCodeInput.length < 5) { setError(studentTeacherIdEl, "Введіть ID вчителя"); hasError = true; }
                
                if (!hasError) {
                    try {
                        const q = query(collection(db, "users"), where("teacherCode", "==", tCodeInput), where("role", "==", "teacher"));
                        const querySnapshot = await getDocs(q);
                        
                        if (querySnapshot.empty) {
                            setError(studentTeacherIdEl, "Вчителя з таким ID не знайдено!");
                            unlockButton(); // 🔥 Розблокуємо, бо це помилка логіки
                            return; 
                        } else {
                            const teacherDoc = querySnapshot.docs[0];
                            linkedTeacherUid = teacherDoc.id;
                        }
                    } catch (e) {
                        console.error(e);
                        alert("Помилка перевірки вчителя");
                        unlockButton(); // 🔥
                        return;
                    }

                    const parts = nameFull.split(" ");
                    const surname = parts[0];
                    const firstName = parts[1] || "";
                    const rnd = Math.floor(10 + Math.random() * 90);
                    
                    const loginID = `${getShortTranslit(surname)}_${getShortTranslit(firstName)}_${rnd}`;
                    
                    loginToDisplay = loginID;
                    finalEmail = `${loginID}${STUDENT_DOMAIN}`;
                }
            }

            if (hasError) {
                unlockButton(); // 🔥 Розблокуємо, якщо є помилки у полях
                return;
            }

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
                    
                    teacherCode: generatedTeacherCode,
                    teacherUid: linkedTeacherUid,
                    
                    loginID: loginToDisplay,
                    profile: { gold: 2500, inventory: [], welcomeBonusReceived: true, avatar: 'assets/img/base.png' },
                    createdAt: new Date().toISOString()
                };

                await setDoc(doc(db, "users", user.uid), newUserData);

                console.log("✅ Успіх:", loginToDisplay);
                
                // Тут кнопку можна НЕ розблокувати, бо ми ховаємо форму
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
                unlockButton(); // 🔥 ОБОВ'ЯЗКОВО розблокуємо кнопку при помилці Firebase
                
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

        newLoginBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // Запобігаємо перезавантаженню

             // Можна додати таке саме блокування і для кнопки входу:
            newLoginBtn.disabled = true;
            newLoginBtn.innerText = "Вхід...";
            
            const unlockLogin = () => {
                 newLoginBtn.disabled = false;
                 newLoginBtn.innerText = "Увійти";
            };

            clearAllErrors("login-form");

            const emailEl = document.getElementById("login-email");
            const passEl = document.getElementById("login-pass");
            let inputLogin = emailEl.value.trim();
            const pass = passEl.value.trim();
            
            let hasEmpty = false;
            if (!inputLogin) { setError(emailEl, "Введіть логін або email"); hasEmpty = true; }
            if (!pass) { setError(passEl, "Введіть пароль"); hasEmpty = true; }
            
            if (hasEmpty) { unlockLogin(); return; } // 🔥

            if (!inputLogin.includes("@")) {
                inputLogin = inputLogin + STUDENT_DOMAIN; // STUDENT_DOMAIN має бути доступний у scope
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
                    // Кнопку не розблокуємо, бо переходимо далі
                } else {
                    setError(emailEl, "Помилка профілю. Зверніться до вчителя.");
                    unlockLogin(); // 🔥
                }
            } catch (error) {
                console.error("Login Error:", error.code);
                unlockLogin(); // 🔥 Розблокування при помилці
                
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
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
    }

    // Логіка кнопки "Назад"
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