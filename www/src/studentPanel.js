// src/studentPanel.js

import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemById } from "./shopData.js";
import { db } from "./firebase.js"; 
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 🖼️ КОНФІГУРАЦІЯ АВАТАРІВ
// ==========================================
const DEFAULT_AVATAR = 'assets/img/base.png';

const AVAILABLE_AVATARS = [
    'assets/img/boy.png',
    'assets/img/girl.png',
];

// ==========================================
// 📡 ГЛОБАЛЬНИЙ СЛУХАЧ (UNITY <-> SITE)
// ==========================================
if (!window.hasUnityListener) {
    window.addEventListener("message", function(event) {
        if (typeof event.data !== "string") return;

        console.log("📨 Отримано повідомлення від Unity:", event.data); // 🔥 ДИВИСЬ В КОНСОЛЬ (F12)

        // --- ВАРІАНТ 1: Новий формат (Золото + Оцінка + Рівень) ---
        // Очікуємо: "LEVEL_COMPLETE|100|12|1" (Золото | Оцінка | Номер рівня)
        if (event.data.startsWith("LEVEL_COMPLETE|")) {
            const parts = event.data.split("|");
            
            // Захист від помилок (якщо Unity прислала щось дивне)
            const amount = parseInt(parts[1]) || 50;  // Якщо NaN, дамо 50 монет
            const grade = parseFloat(parts[2]) || 0;
            const levelIndex = parseInt(parts[3]) || 1; // Номер рівня, який пройшли

            handleLevelComplete(amount, grade, levelIndex);
        }
        // --- ВАРІАНТ 2: Закриття гри ---
        else if (event.data === "CLOSE_GAME") {
            if (window.closeUnityGame) window.closeUnityGame();
        }
    });
    window.hasUnityListener = true;
}

// Функція обробки результатів
async function handleLevelComplete(amount, grade, levelCompleted) {
    console.log("📥 Отримано дані з Unity (сирі):", amount, grade, levelCompleted);

    let currentUser = getCurrentUser(); 
    if (!currentUser) return;

    // --- 🛡️ БЛОК ЗАХИСТУ ДАНИХ (Sanitization) ---
    
    // 1. Примусово робимо числами
    let safeAmount = Number(amount);
    let safeGrade = Number(grade);
    let safeLevel = Number(levelCompleted);

    // 2. Якщо вийшло NaN (помилка), замінюємо на безпечні нулі
    if (isNaN(safeAmount)) {
        console.warn("⚠️ Помилка в amount, замінено на 0");
        safeAmount = 0;
    }
    if (isNaN(safeGrade)) {
        safeGrade = 0;
    }
    if (isNaN(safeLevel)) {
        safeLevel = 1;
    }
    // ----------------------------------------------

    console.log(`✅ Чисті дані для запису: Золото=${safeAmount}, Оцінка=${safeGrade}, Рівень=${safeLevel}`);

    // Переконуємось, що профіль існує
    if (!currentUser.profile) currentUser.profile = {};
    
    // Отримуємо поточне золото з бази, теж захищаючись від NaN
    let currentGoldInDb = Number(currentUser.profile.gold);
    if (isNaN(currentGoldInDb)) currentGoldInDb = 0;

    // Оновлюємо баланс
    currentUser.profile.gold = currentGoldInDb + safeAmount;

    // Логіка рівнів
    if (!currentUser.profile.progress) currentUser.profile.progress = {};
    const currentMax = Number(currentUser.profile.progress.maxLevel) || 1;
    
    if (safeLevel >= currentMax) {
         currentUser.profile.progress.maxLevel = safeLevel + 1;
    }

    // Зберігаємо профіль (тепер тут точно числа!)
    await saveUserData(currentUser);
    updateHomeDisplay(currentUser);

    // Зберігаємо історію для вчителя
    try {
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await addDoc(collection(db, "game_results"), {
            userId: currentUser.uid,
            userName: currentUser.name,
            userClass: currentUser.className || "N/A",
            level: safeLevel,     // Точно число
            grade: safeGrade,     // Точно число
            goldEarned: safeAmount, // Точно число
            timestamp: new Date()
        });
    } catch (e) { console.error("History save error:", e); }

    // Повідомлення
    alert(`🎉 Рівень пройдено!\n💰 Отримано: ${safeAmount} монет`);
    
    setTimeout(() => renderLeaderboard(currentUser), 1500);
}

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) {
        try {   
            const userRef = doc(db, "users", user.uid);
            // Зберігаємо весь профіль, включаючи новий аватар
            await updateDoc(userRef, { profile: user.profile });
        } catch (e) { console.error("Save Error:", e); }
    }
}

// ==========================================
// 🚀 ОСНОВНА ФУНКЦІЯ ІНІЦІАЛІЗАЦІЇ
// ==========================================
export async function initStudentPanel() {
    console.log("StudentPanel: Init...");
    
    // Завантаження конфігу гри
    try {
        const configRef = doc(db, "game_config", "maze_1");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            localStorage.setItem("game_config_data", JSON.stringify(configSnap.data()));
        }
    } catch (e) { console.error("Config Error:", e); }

    let user = getCurrentUser();
    if (!user) return;

    // Оновлення інтерфейсу
    updateHomeDisplay(user);
    renderLeaderboard(user);

    // Ініціалізація системи аватарів
    setupAvatarSystem(user);

    // Магазин
    const shopItems = getShopItems();
    renderShopSection("rewards-micro-list", shopItems.micro);
    renderShopSection("rewards-medium-list", shopItems.medium);
    renderShopSection("rewards-large-list", shopItems.large);

    // Підключення кнопок Unity
    setupUnityUI();
}

// ==========================================
// 🦁 СИСТЕМА АВАТАРІВ (НОВА)
// ==========================================
function setupAvatarSystem(user) {
    const editBtn = document.getElementById("btn-edit-avatar");
    if (editBtn) {
        const newBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newBtn, editBtn);
        newBtn.addEventListener("click", () => openAvatarModal());
    }
}

function openAvatarModal() {
    const container = document.getElementById("avatar-modal-container");
    const user = getCurrentUser();

    if (!container) return;

    // 🔥 FIX: Авто-виправлення шляху і тут, щоб в модалці виділявся правильний
    let currentAvatar = user.profile.avatar || DEFAULT_AVATAR;
    if (currentAvatar.includes('assets/avatars/')) {
        currentAvatar = currentAvatar.replace('assets/avatars/', 'assets/img/');
    }

    // Генеруємо HTML для модалки
    let avatarsHtml = AVAILABLE_AVATARS.map(src => `
        <div class="avatar-option ${src === currentAvatar ? 'selected' : ''}" onclick="selectAvatar('${src}')">
            <img src="${src}" alt="avatar">
        </div>
    `).join('');

    container.innerHTML = `
        <div class="avatar-modal-overlay" onclick="closeAvatarModal()">
            <div class="avatar-modal-content" onclick="event.stopPropagation()">
                <h3>Обери свого героя! 🦁</h3>
                <div class="avatars-grid">
                    ${avatarsHtml}
                </div>
                <button class="close-modal-btn" onclick="closeAvatarModal()">Закрити</button>
            </div>
        </div>
    `;
    
    window.closeAvatarModal = () => {
        container.innerHTML = "";
    };

    window.selectAvatar = async (newSrc) => {
        const currentUser = getCurrentUser();
        currentUser.profile.avatar = newSrc;
        
        // Оновлюємо вигляд зразу
        updateHomeDisplay(currentUser);
        
        // Закриваємо модалку
        window.closeAvatarModal();
        
        // Зберігаємо в БД
        await saveUserData(currentUser);
        console.log("Avatar updated:", newSrc);
    };
}

// ==========================================
// 🎮 ЛОГІКА UNITY (IFRAME)
// ==========================================
function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (startBtn) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            if (unityContainer) {
                unityContainer.classList.remove("hidden");
                newBtn.style.display = "none"; 

                if (!document.getElementById("btn-force-close-unity")) {
                    const closeBtn = document.createElement("button");
                    closeBtn.id = "btn-force-close-unity";
                    closeBtn.innerText = "✖ Закрити";
                    closeBtn.style.cssText = "margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px 15px; cursor: pointer; float: right; border-radius: 5px;";
                    closeBtn.onclick = window.closeUnityGame;
                    unityContainer.parentNode.insertBefore(closeBtn, unityContainer);
                }

                let iframe = unityContainer.querySelector("iframe");
                if (!iframe) {
                     iframe = document.createElement("iframe");
                     iframe.src = "unity/index.html?v=" + new Date().getTime(); 
                     iframe.style.width = "100%";
                     iframe.style.height = "100%";
                     iframe.style.border = "none";
                     unityContainer.appendChild(iframe);
                }
            }
        };
    }

    window.closeUnityGame = function() {
        if (unityContainer) {
            unityContainer.classList.add("hidden");
            const iframe = unityContainer.querySelector("iframe");
            if (iframe) iframe.remove();
        }
        const closeBtn = document.getElementById("btn-force-close-unity");
        if (closeBtn) closeBtn.remove();
        
        const btn = document.getElementById("btn-start-lesson");
        if(btn) btn.style.display = "inline-block"; 
        
        let u = getCurrentUser();
        updateHomeDisplay(u);
        renderLeaderboard(u);
    };
}

// ==========================================
// 🏆 ФУНКЦІЇ ВІДОБРАЖЕННЯ (UI)
// ==========================================

async function renderLeaderboard(currentUser) {
    const container = document.getElementById("view-leaderboard");
    if (!container) return;

    container.innerHTML = `
        <div class="teacher-header"><h2>🏆 Рейтинг класу ${currentUser.className || ""}</h2></div>
        <div style="background: #222; padding: 20px; border-radius: 10px; min-height: 300px;">
            <table class="leaderboard-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                <thead>
                    <tr style="color: #aaa; text-align: left;">
                        <th style="padding: 10px 20px;">#</th>
                        <th style="width: 50%;">Учень</th> <th style="width: 30%;">Золото</th>
                    </tr>
                </thead>
                <tbody id="leaderboard-body"><tr><td colspan="3" style="text-align:center; color:#777;">Завантаження... ⏳</td></tr></tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById("leaderboard-body");
    try {
        const q = query(
            collection(db, "users"),
            where("role", "==", "student"),
            where("className", "==", currentUser.className),
            where("teacherUid", "==", currentUser.teacherUid)
        );
        const querySnapshot = await getDocs(q);
        let classmates = []; // Використовуємо let, щоб можна було модифікувати

        // 1. Отримуємо дані та чистимо їх від "сміття" (NaN)
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // 🔥 ВАЖЛИВО: Захист від NaN
            let safeGold = Number(data.profile?.gold);
            if (isNaN(safeGold)) {
                safeGold = 0; 
            }

            classmates.push({ 
                ...data, 
                uid: doc.id, 
                cleanGold: safeGold // Зберігаємо чисте значення для сортування
            });
        });
        
        // 2. Сортуємо по чистому значенню
        classmates.sort((a, b) => b.cleanGold - a.cleanGold);

        if (classmates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#777;">Клас пустий...</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        classmates.forEach((student, index) => {
            const tr = document.createElement("tr");
            let rankClass = "rank-other"; 
            let rankIcon = `#${index + 1}`;
            
            if (index === 0) { rankClass = "rank-1"; rankIcon = "👑 1"; }
            else if (index === 1) { rankClass = "rank-2"; rankIcon = "🥈 2"; }
            else if (index === 2) { rankClass = "rank-3"; rankIcon = "🥉 3"; }

            tr.className = rankClass;
            if (student.uid === currentUser.uid) tr.classList.add("is-current-user");

            // Перевірка аватара
            let ava = student.profile?.avatar || 'assets/img/boy.png';
            if (ava.includes('assets/avatars/')) {
                ava = ava.replace('assets/avatars/', 'assets/img/');
            }

            tr.innerHTML = `
                <td class="rank-col" style="font-weight:bold;">${rankIcon}</td>
                <td class="name-col" style="font-size: 1.1em; color: white; display: flex; align-items: center; gap: 10px;">
                    <img src="${ava}" 
                         style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;"
                         onerror="this.src='assets/img/boy.png'">
                    ${student.name}
                </td>
                <td class="gold-col" style="color: #f1c40f; font-weight: bold;">${student.cleanGold} 💰</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Leaderboard Error:", error);
        tbody.innerHTML = `<tr><td colspan="3" style="color:#e74c3c; text-align:center;">Помилка завантаження</td></tr>`;
    }
}

function updateHomeDisplay(currentUser) {
    if (!currentUser) return;
    
    // --- Оновлюємо ім'я та аватар ---
    document.getElementById("student-name-display").textContent = currentUser.name;
    document.getElementById("student-class-display").textContent = currentUser.className || "--";
    
    const avatarImg = document.getElementById("current-user-avatar");
    if (avatarImg) {
        let path = currentUser.profile.avatar || DEFAULT_AVATAR;

        // 🛠️ FIX: Авто-заміна старого шляху "avatars" на "img"
        if (path.includes('assets/avatars/')) {
            path = path.replace('assets/avatars/', 'assets/img/');
        }

        avatarImg.src = path;

        // 🛠️ FIX: Якщо файл все одно не знайдено, ставимо запасний
        avatarImg.onerror = function() {
            // Щоб не зациклилось
            if (this.src.includes('boy.png')) return; 
            this.src = 'assets/img/boy.png';
        };
    }

    const goldEl = document.getElementById("student-gold-display");
    if (goldEl) {
        goldEl.textContent = currentUser.profile.gold;
        goldEl.classList.remove("pulse");
        void goldEl.offsetWidth; 
        goldEl.classList.add("pulse");
    }
    renderInventory(currentUser);
}

function renderInventory(currentUser) {
    const listEl = document.getElementById("student-inventory-list");
    if (!listEl) return;
    
    const userInv = currentUser.profile.inventory || [];
    if (userInv.length === 0) {
        listEl.innerHTML = '<li class="empty-msg" style="width:100%; text-align:center;">Поки що пусто...</li>';
        listEl.style.display = "block";
        return;
    }

    listEl.className = "treasury-grid";
    listEl.style.display = "flex";
    listEl.innerHTML = "";

    const shopDB = getShopItems();
    const createColumn = (title, dbItems) => {
        const itemsInCat = dbItems.filter(shopItem => userInv.some(uItem => uItem.name === shopItem.name));
        let contentHtml = itemsInCat.length === 0 ? `<div class="inv-empty-category">Пусто...</div>` : "";
        
        itemsInCat.forEach(shopItem => {
            const count = userInv.filter(uItem => uItem.name === shopItem.name).length;
            contentHtml += `
                <div class="inventory-card-item">
                    <div class="inv-name">${shopItem.name} <span class="item-count">x${count}</span></div>
                    <div class="inv-desc">${shopItem.desc}</div>
                </div>`;
        });

        return `<div class="reward-column"><div class="reward-header">${title}</div><div class="dashed-line"></div><div class="inventory-column-content">${contentHtml}</div></div>`;
    };

    listEl.innerHTML += createColumn("Мої Мікро-нагороди", shopDB.micro);
    listEl.innerHTML += createColumn("Мої Середні нагороди", shopDB.medium);
    listEl.innerHTML += createColumn("Мої Великі нагороди", shopDB.large);
}

function renderShopSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "shop-item";
        div.innerHTML = `
            <div class="shop-item-row"><div class="item-name">${item.name}</div><div class="item-price">${item.price} 💰</div></div>
            <div class="item-desc">${item.desc}</div>
            <button class="btn-buy" data-id="${item.id}">Купити</button>
        `;
        div.querySelector(".btn-buy").onclick = () => buyItem(item);
        container.appendChild(div);
    });
}

function buyItem(visualItem) {
    let u = getCurrentUser();
    const realItem = findItemById(visualItem.id);
    if (!realItem) return;
    if (u.profile.gold >= realItem.price) {
        u.profile.gold -= realItem.price;
        if (!u.profile.inventory) u.profile.inventory = [];
        u.profile.inventory.push({ id: realItem.id, name: realItem.name, date: new Date().toISOString() });
        saveUserData(u);
        updateHomeDisplay(u);
        alert(`Придбано: ${realItem.name}!`);
    } else {
        alert("Недостатньо золота!");
    }
}