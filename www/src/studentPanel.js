// src/studentPanel.js

import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList } from "./shopData.js";
import { db } from "./firebase.js"; 
import { collection, query, where, getDocs, doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 🖼️ КОНФІГУРАЦІЯ АВАТАРІВ
// ==========================================
const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = [
    'assets/img/boy.png',
    'assets/img/girl.png',
];

let cachedShopItems = null;

// ==========================================
// 📡 ГЛОБАЛЬНИЙ СЛУХАЧ (UNITY <-> SITE)
// ==========================================
if (!window.hasUnityListener) {
    window.addEventListener("message", function(event) {
        // Якщо прийшов сигнал про закриття
        if (event.data === "CLOSE_GAME") {
            if (window.closeUnityGame) window.closeUnityGame();
            return;
        }

        // Спробуємо розпарсити JSON (бо Unity тепер шле JSON)
        try {
    const data = JSON.parse(event.data);
    
    // Якщо прийшов формат з type та payload (як ми робили в Unity)
    if (data.type === "LEVEL_COMPLETE" && data.payload) {
        const payload = JSON.parse(data.payload);
        console.log("🏆 Результати (Payload):", payload);
        // Використовуємо payload.score, бо Unity шле "score"
        handleLevelComplete(payload.score, payload.grade, payload.level);
    } 
    // Якщо прийшов прямий JSON (про всяк випадок)
    else if (data.gold !== undefined || data.score !== undefined) {
        handleLevelComplete(data.gold || data.score, data.grade, data.level);
    }
} catch (e) {
            // Якщо це не JSON, можливо це старий формат рядка?
            if (typeof event.data === "string" && event.data.startsWith("LEVEL_COMPLETE|")) {
                const parts = event.data.split("|");
                handleLevelComplete(parseInt(parts[1]), parseFloat(parts[2]), parseInt(parts[3]));
            }
        }
    });
    window.hasUnityListener = true;
}

async function handleLevelComplete(amount, grade, levelCompleted) {
    let currentUser = getCurrentUser(); 
    if (!currentUser) return;

    let safeAmount = Number(amount) || 0;
    let safeGrade = Number(grade) || 0;
    let safeLevel = Number(levelCompleted) || 1;

    // 1. Оновлюємо золото в локальному об'єкті
    if (!currentUser.profile) currentUser.profile = {};
    let currentGoldInDb = Number(currentUser.profile.gold) || 0;
    currentUser.profile.gold = currentGoldInDb + safeAmount;

    // 2. Оновлюємо прогрес рівнів
    if (!currentUser.profile.progress) currentUser.profile.progress = {};
    const currentMax = Number(currentUser.profile.progress.maxLevel) || 1;
    if (safeLevel >= currentMax) {
         currentUser.profile.progress.maxLevel = safeLevel + 1;
    }

    // 3. Зберігаємо в Firebase та localStorage
    await saveUserData(currentUser);
    
    // 4. ОНОВЛЮЄМО UI
    updateHomeDisplay(currentUser);
    
    // 🔥 Оновлюємо розділи магазину, щоб ціни були актуальними
    if (cachedShopItems) {
        renderShopSection("rewards-micro-list", cachedShopItems.micro);
        renderShopSection("rewards-medium-list", cachedShopItems.medium);
        renderShopSection("rewards-large-list", cachedShopItems.large);
    }

    // 5. Запис в історію результатів (твій код без змін)
    try {
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await addDoc(collection(db, "game_results"), {
            userId: currentUser.uid,
            teacherUid: currentUser.teacherUid,
            userName: currentUser.name,
            userClass: currentUser.className || "N/A",
            topic: "Fractions", // ДОДАЙ ЦЕ ПОЛЕ, щоб вчитель бачив тему
            level: safeLevel,
            grade: safeGrade,
            goldEarned: safeAmount,
            timestamp: new Date()
        });
    } catch (e) { console.error("History save error:", e); }

    alert(`🎉 Рівень пройдено!\n💰 Отримано: ${safeAmount} монет\n⭐ Оцінка: ${safeGrade}`);
    setTimeout(() => renderLeaderboard(currentUser), 1500);
}

// ==========================================
// 🎮 ЛОГІКА UNITY (ЗАПУСК ТА ЗАКРИТТЯ)
// ==========================================
function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (startBtn) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            const user = getCurrentUser();
            if (!user || !user.teacherUid) return alert("Помилка зв'язку з вчителем.");

            if (unityContainer) {
                unityContainer.classList.remove("hidden");
                newBtn.style.display = "none"; 

                if (!document.getElementById("btn-force-close-unity")) {
                    const closeBtn = document.createElement("button");
                    closeBtn.id = "btn-force-close-unity";
                    closeBtn.innerText = "✖ Закрити гру";
                    closeBtn.style.cssText = "margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px 15px; cursor: pointer; float: right; border-radius: 5px; font-weight: bold;";
                    closeBtn.onclick = () => window.closeUnityGame();
                    unityContainer.parentNode.insertBefore(closeBtn, unityContainer);
                }

                let iframe = unityContainer.querySelector("iframe");
                if (!iframe) {
                    iframe = document.createElement("iframe");
                    const currentLevel = user.profile?.progress?.maxLevel || 1;
                    iframe.src = `unity/index.html?teacherId=${user.teacherUid}&topic=Fractions&level=${currentLevel}&v=${Date.now()}`;
                    iframe.style.cssText = "width:100%; height:100%; border:none; min-height: 600px;";

                    // Ретранслятор повідомлень
                    const messageHandler = (event) => {
                        if (event.source === iframe.contentWindow) {
                            console.log("🔄 Ретрансляція від Unity:", event.data);
                            window.postMessage(event.data, "*"); 
                        }
                    };
                    
                    window.addEventListener("message", messageHandler);
                    // Зберігаємо посилання, щоб видалити при закритті
                    iframe._handler = messageHandler; 

                    unityContainer.appendChild(iframe);
                }
            }
        };
    }

    window.closeUnityGame = function() {
        if (unityContainer) {
            unityContainer.classList.add("hidden");
            const iframe = unityContainer.querySelector("iframe");
            if (iframe) {
                if (iframe._handler) window.removeEventListener("message", iframe._handler);
                iframe.remove();
            }
        }
        const closeBtn = document.getElementById("btn-force-close-unity");
        if (closeBtn) closeBtn.remove();
        if (startBtn) startBtn.style.display = "inline-block"; 
        
        let u = getCurrentUser();
        if (typeof updateHomeDisplay === "function") updateHomeDisplay(u);
    };
}
// ==========================================
// КІНЕЦЬ ЛОГІКИ UNITY
// ==========================================

// ==========================================
// 🦁 СИСТЕМА АВАТАРІВ
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

    let currentAvatar = user.profile.avatar || DEFAULT_AVATAR;
    if (currentAvatar.includes('assets/avatars/')) {
        currentAvatar = currentAvatar.replace('assets/avatars/', 'assets/img/');
    }

    let avatarsHtml = AVAILABLE_AVATARS.map(src => `
        <div class="avatar-option ${src === currentAvatar ? 'selected' : ''}" onclick="selectAvatar('${src}')">
            <img src="${src}" alt="avatar">
        </div>
    `).join('');

    container.innerHTML = `
        <div class="avatar-modal-overlay" onclick="closeAvatarModal()">
            <div class="avatar-modal-content" onclick="event.stopPropagation()">
                <h3>Обери свого героя! 🦁</h3>
                <div class="avatars-grid">${avatarsHtml}</div>
                <button class="close-modal-btn" onclick="closeAvatarModal()">Закрити</button>
            </div>
        </div>
    `;
    
    window.closeAvatarModal = () => { container.innerHTML = ""; };

    window.selectAvatar = async (newSrc) => {
        const currentUser = getCurrentUser();
        currentUser.profile.avatar = newSrc;
        updateHomeDisplay(currentUser);
        window.closeAvatarModal();
        await saveUserData(currentUser);
    };
}

// ==========================================
// 💰 МАГАЗИН ТА ІНВЕНТАР
// ==========================================
function renderShopSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container || !items) return;
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
    const realItem = findItemInList(cachedShopItems, visualItem.id);
    if (!realItem) return;

    if (u.profile.gold >= realItem.price) {
        if (!confirm(`Купити "${realItem.name}" за ${realItem.price} золота?`)) return;
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

    const shopDB = cachedShopItems || { micro: [], medium: [], large: [] };

    const createColumn = (title, dbItems) => {
        const safeItems = dbItems || [];
        const itemsInCat = safeItems.filter(shopItem => userInv.some(uItem => uItem.name === shopItem.name));
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
        let classmates = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let safeGold = Number(data.profile?.gold) || 0;
            classmates.push({ ...data, uid: doc.id, cleanGold: safeGold });
        });
        
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

            let ava = student.profile?.avatar || 'assets/img/boy.png';
            if (ava.includes('assets/avatars/')) ava = ava.replace('assets/avatars/', 'assets/img/');

            tr.innerHTML = `
                <td class="rank-col" style="font-weight:bold;">${rankIcon}</td>
                <td class="name-col" style="font-size: 1.1em; color: white; display: flex; align-items: center; gap: 10px;">
                    <img src="${ava}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" onerror="this.src='assets/img/boy.png'">
                    ${student.name}
                </td>
                <td class="gold-col" style="color: #f1c40f; font-weight: bold;">${student.cleanGold} 💰</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:#e74c3c; text-align:center;">Помилка завантаження</td></tr>`;
    }
}

function updateHomeDisplay(currentUser) {
    if (!currentUser) return;
    document.getElementById("student-name-display").textContent = currentUser.name;
    document.getElementById("student-class-display").textContent = currentUser.className || "--";
    
    const avatarImg = document.getElementById("current-user-avatar");
    if (avatarImg) {
        let path = currentUser.profile.avatar || DEFAULT_AVATAR;
        if (path.includes('assets/avatars/')) path = path.replace('assets/avatars/', 'assets/img/');
        avatarImg.src = path;
    }

    const goldEl = document.getElementById("student-gold-display");
    if (goldEl) {
        goldEl.textContent = currentUser.profile.gold;
    }
    renderInventory(currentUser);
}

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) {
        try {   
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { profile: user.profile });
        } catch (e) { console.error("Save Error:", e); }
    }
}

function startLiveGoldTracker(userId) {
    console.log("📡 Запущено живий трекер золота...");
    
    const userRef = doc(db, "users", userId);
    
    // onSnapshot спрацьовує автоматично кожного разу, коли дані в Firebase змінюються
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const freshData = docSnap.data();
            console.log("💰 Отримано оновлення золота з бази:", freshData.profile?.gold);
            
            // 1. Оновлюємо локальні дані
            let user = getCurrentUser();
            user.profile = freshData.profile;
            localStorage.setItem("currentUser", JSON.stringify(user));
            
            // 2. Оновлюємо відображення на екрані
            updateHomeDisplay(user);
        }
    });
}
// ==========================================
// 🚀 ІНІЦІАЛІЗАЦІЯ ПАНЕЛІ
// ==========================================
export async function initStudentPanel() {
    let user = getCurrentUser();
    if (!user) return;

    startLiveGoldTracker(user.uid);

    try {
        cachedShopItems = await getShopItems();
    } catch (e) {
        cachedShopItems = { micro: [], medium: [], large: [] };
    }

    updateHomeDisplay(user);
    renderLeaderboard(user);
    setupAvatarSystem(user);

    if (cachedShopItems) {
        renderShopSection("rewards-micro-list", cachedShopItems.micro);
        renderShopSection("rewards-medium-list", cachedShopItems.medium);
        renderShopSection("rewards-large-list", cachedShopItems.large);
    }

    setupUnityUI();
}