import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList } from "./shopData.js";
import { db } from "./firebase.js"; 
import { sendConfigToUnity } from "./gameBridge.js"; 

import { 
    collection, 
    query, 
    where,  
    setDoc, 
    doc, 
    updateDoc, 
    onSnapshot, 
    addDoc, 
    serverTimestamp,
    orderBy,  
    limit,     
    increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Глобальні змінні стану
let leaderboardUnsubscribe = null;
let diaryUnsubscribe = null; 
let goldTrackerUnsubscribe = null;
let cachedShopItems = null;
let isProcessingReward = false; 

const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = [ 'assets/img/boy.png', 'assets/img/girl.png' ];
window.currentTopicId = null; 

// ==========================================
// 🎮 ГЛОБАЛЬНИЙ СЛУХАЧ UNITY
// ==========================================
window.addEventListener("message", (event) => {
    const iframe = document.getElementById("unity-iframe");
    if (!iframe || event.source !== iframe.contentWindow) return;

    const user = getCurrentUser();

    // 1. Запит конфігурації
    if (event.data && (event.data.type === "REQUEST_CONFIG" || event.data.type === "UNITY_READY")) {
        if (user) {
            const topicName = event.data.topic || "Fractions";
            const levelRequest = event.data.level || 1;
            
            // Ми прибрали локальний об'єкт selectedBoosters, 
            // бо gameBridge.js сам зчитає стан чекбоксів з DOM.
            console.log(`🎮 Запит конфігурації: ${topicName}, рівень ${levelRequest}`);
            
            // ВИПРАВЛЕНО: Видалено неіснуючу змінну selectedBoosters з аргументів
            sendConfigToUnity(topicName, user.teacherUid, user.uid, levelRequest);
        }
    }

    // 2. Запит ліміту рівня від вчителя
    else if (event.data && event.data.type === "REQUEST_TEACHER_LIMIT") {
        if (user) {
            const currentTopic = window.currentTopicId || "Fractions";
            let limitVal = 99;
            if (user.progress?.[currentTopic]?.maxAllowedLevel) {
                limitVal = parseInt(user.progress[currentTopic].maxAllowedLevel);
            }
            
            const target = iframe.contentWindow.unityInstance || window.unityGame;
            if (target) {
                target.SendMessage("MenuController", "SetTeacherLimit", limitVal);
            }
        }
    }

    // 3. Обробка завершення рівня
    else if (event.data && typeof event.data === "string" && event.data.startsWith("LEVEL_COMPLETE|")) {
        if (isProcessingReward) return;

        if (user) {
            try {
                isProcessingReward = true;
                setTimeout(() => { isProcessingReward = false; }, 2000);

                const jsonPart = event.data.split("|")[1];
                const resultData = JSON.parse(jsonPart);
                saveGameResult(resultData, user);
            } catch (e) { 
                console.error("JSON Error:", e); 
                isProcessingReward = false;
            }
        }
    }

    // 4. Закриття гри
    else if (event.data && event.data.type === "CLOSE_GAME") {
        closeUnityGameUI();
    }
});

function closeUnityGameUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");
    const closeBtn = document.getElementById("btn-force-close-unity");
    const iframe = document.getElementById("unity-iframe");

    if (unityContainer) unityContainer.classList.add("hidden");
    if (startBtn) startBtn.style.display = "block"; 
    if (closeBtn) closeBtn.remove(); 
    if (iframe) iframe.src = "about:blank"; 
}
window.closeUnityGame = closeUnityGameUI;

// ==========================================
// 🚀 БУСТЕРИ UI
// ==========================================
function setupBoostersUI(user) {
    const container = document.getElementById("boosters-container");
    if (!container) return;
    
    container.innerHTML = ""; 
    const inventory = user.profile?.inventory || [];

    const boosterTypes = [
        { id: 'sys_shield', label: '🛡️ Щит' },
        { id: 'sys_time',   label: '⏳ Час' },
        { id: 'sys_radar',  label: '📡 Радар' }
    ];

    let boostersHtml = "";
    let hasAny = false;

    boosterTypes.forEach(type => {
        const count = inventory.filter(i => i.id === type.id).length;
        if (count > 0) {
            hasAny = true;
            boostersHtml += `
                <label class="booster-pill" style="display: inline-flex; align-items: center; background: #2c3e50; padding: 8px 16px; border-radius: 50px; cursor: pointer; border: 2px solid #34495e; transition: all 0.3s ease; user-select: none;">
                    <input type="checkbox" class="booster-checkbox" value="${type.id}" style="width: 18px; height: 18px; margin-right: 10px; accent-color: #f1c40f;"> 
                    <span style="color: white; font-weight: 500; font-size: 0.9em;">
                        ${type.label} <span style="color: #f1c40f; margin-left: 4px;">x${count}</span>
                    </span>
                </label>`;
        }
    });

    if (hasAny) {
        container.innerHTML = `
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <h4 style="margin: 0; font-size: 0.8em; color: #f1c40f; text-transform: uppercase; letter-spacing: 2px;">🛠️ Доступні бонуси:</h4>
                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;">${boostersHtml}</div>
            </div>`;
    } else {
        container.innerHTML = `<p style="color: rgba(255,255,255,0.4); font-size: 0.85em; font-style: italic;">У вас немає активних бустерів.</p>`;
    }
}

async function saveUserData(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        // Оновлюємо весь об'єкт profile в Firebase
        await updateDoc(userRef, {
            profile: user.profile
        });
        console.log("✅ Дані користувача оновлено в Firebase");
    } catch (e) {
        console.error("❌ Помилка збереження даних:", e);
        alert("Помилка при збереженні даних у базу.");
    }
}

// ==========================================
// 🎮 ІНІЦІАЛІЗАЦІЯ UNITY UI
// ==========================================
export function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");
    const user = getCurrentUser(); 

    if (user) setupBoostersUI(user); 

    let iframe = document.getElementById("unity-iframe");
    if (!iframe && unityContainer) {
        iframe = document.createElement("iframe");
        iframe.id = "unity-iframe";
        iframe.style.cssText = "width:100%; height:100%; border:none; min-height: 600px;";
        unityContainer.appendChild(iframe);
    }

    if (startBtn && unityContainer) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            const freshUser = getCurrentUser();
            if (!freshUser) return alert("Ви не авторизовані!");
            
            unityContainer.classList.remove("hidden");
            newBtn.style.display = "none";

            if (!document.getElementById("btn-force-close-unity")) {
                const closeBtn = document.createElement("button");
                closeBtn.id = "btn-force-close-unity";
                closeBtn.innerText = "✖ Закрити гру";
                closeBtn.style.cssText = "margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px 15px; cursor: pointer; float: right; border-radius: 5px; font-weight: bold;";
                closeBtn.onclick = closeUnityGameUI;
                unityContainer.parentNode.insertBefore(closeBtn, unityContainer);
            }

            const frame = document.getElementById("unity-iframe");
            frame.src = `unity/index.html?v=${Date.now()}`;
        };
    }
}

// ==========================================
// 💾 ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТІВ
// ==========================================
async function saveGameResult(resultData, user) {
    try {
        const score = Number(resultData.score || 0);
        // ВАЖЛИВО: Переконайтеся, чи ваша колекція "users" чи "students"
        const userRef = doc(db, "users", user.uid); 

        // Тільки додаємо золото
        await updateDoc(userRef, { 
            "profile.gold": increment(score) 
        });

        // Зберігаємо сесію
        await addDoc(collection(db, "users", user.uid, "game_sessions"), {
            ...resultData,
            timestamp: serverTimestamp(),
            win: score > 0 
        });
        console.log("✅ Результат збережено, золото додано:", score);
    } catch (e) { 
        console.error("❌ Save Error:", e); 
    }
}

// ==========================================
// 📓 ЩОДЕННИК
// ==========================================
export function renderStudentDiary(currentUser) {
    const tbody = document.getElementById("student-journal-tbody");
    if (!tbody) return;

    if (diaryUnsubscribe) diaryUnsubscribe();

    const q = query(collection(db, "users", currentUser.uid, "game_sessions"), orderBy("timestamp", "desc"), limit(50));

    diaryUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:#777;">Історія порожня.</td></tr>`;
            return;
        }
        tbody.innerHTML = snapshot.docs.map(docSnap => {
            const d = docSnap.data();
            const date = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleString('uk-UA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "--";
            let gColor = d.grade >= 10 ? "#2ecc71" : (d.grade >= 7 ? "#f1c40f" : "#e74c3c");
            
            return `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 12px; color: #ccc;">${date}</td>
                    <td style="text-align: center; color: white;">${d.level} (${d.topic})</td>
                    <td style="text-align: center;">${d.timeSpent}с</td>
                    <td style="text-align: center;">${d.mistakes}</td>
                    <td style="text-align: center; color: #f1c40f;">+${d.score} 💰</td>
                    <td style="text-align: center;"><span style="color:${gColor}; font-weight:bold;">${d.grade}</span></td>
                </tr>`;
        }).join('');
    });
}

// ==========================================
// 🛠️ СИСТЕМНІ ТА МАГАЗИН
// ==========================================
function updateHomeDisplay(currentUser) {
    if (!currentUser) return;
    document.getElementById("student-name-display").textContent = currentUser.name;
    const goldEl = document.getElementById("student-gold-display");
    if (goldEl) goldEl.textContent = currentUser.profile.gold;
    
    const avatarImg = document.getElementById("current-user-avatar");
    if (avatarImg) avatarImg.src = currentUser.profile.avatar?.replace('assets/avatars/', 'assets/img/') || DEFAULT_AVATAR;

    renderInventory(currentUser);
    renderStudentDiary(currentUser);
    setupBoostersUI(currentUser);
}

function startLiveGoldTracker(userId) {
    if (goldTrackerUnsubscribe) goldTrackerUnsubscribe();
    const userRef = doc(db, "users", userId);
    
    goldTrackerUnsubscribe = onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.needReset) {
                await updateDoc(userRef, { needReset: false });
                indexedDB.deleteDatabase("/idbfs");
                alert("Прогрес скинуто вчителем.");
                location.reload();
                return;
            }
            let user = getCurrentUser();
            user.profile = data.profile;
            localStorage.setItem("currentUser", JSON.stringify(user));
            updateHomeDisplay(user);
            setupBoostersUI(user);
        }
    });
}

// ==========================================
// 🚀 ІНІЦІАЛІЗАЦІЯ
// ==========================================
export async function initStudentPanel() {
    let user = getCurrentUser();
    if (!user) return;
    
    startLiveGoldTracker(user.uid);
    try { cachedShopItems = await getShopItems(user.teacherUid); } catch (e) { }
    
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



// ==========================================
// 🛠️ АДМІН-ФУНКЦІЇ, МАГАЗИН, ІНВЕНТАР, ЛІДЕРБОРД
// (Залишаються без змін, вони не впливають на помилку золота)
// ==========================================

window.resetStudentLevel = async (studentId, topic, newLevel) => {
    try {
        const userRef = doc(db, "users", studentId);
        await setDoc(userRef, {
            progress: { [topic]: { maxAllowedLevel: newLevel } }
        }, { merge: true });
        console.log(`✅ Soft Reset: maxLevel -> ${newLevel}`);
    } catch (e) { console.error(e); }
};

window.adminHardReset = async (studentId) => {
    try {
        const userRef = doc(db, "users", studentId);
        await updateDoc(userRef, { needReset: true });
        console.log(`💣 Hard Reset: Відправлено команду знищення даних.`);
    } catch (e) { console.error(e); }
};

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
    if (currentAvatar.includes('assets/avatars/')) currentAvatar = currentAvatar.replace('assets/avatars/', 'assets/img/');
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
        </div>`;
    window.closeAvatarModal = () => { container.innerHTML = ""; };
    window.selectAvatar = async (newSrc) => {
        const currentUser = getCurrentUser();
        currentUser.profile.avatar = newSrc;
        updateHomeDisplay(currentUser);
        window.closeAvatarModal();
        await saveUserData(currentUser);
    };
}

function renderShopSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container || !items) return;
    container.innerHTML = "";
    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "shop-item";
        div.innerHTML = `
            <div class="shop-item-row">
                <div class="item-name">${item.name}</div>
                <div class="item-price">${item.price} 💰</div>
            </div>
            <div class="item-desc">${item.desc}</div>
            <button class="btn-buy" data-id="${item.id}">Купити</button>
        `;
        div.querySelector(".btn-buy").onclick = () => buyItem(item);
        container.appendChild(div);
    });
}

async function buyItem(visualItem) {
    let u = getCurrentUser();
    if (!u) return;

    const realItem = findItemInList(cachedShopItems, visualItem.id);
    if (!realItem) return;

    if (u.profile.gold >= realItem.price) {
        if (!confirm(`Купити "${realItem.name}" за ${realItem.price} золота?`)) return;

        // 1. Оновлюємо локальні дані
        u.profile.gold -= realItem.price;
        if (!u.profile.inventory) u.profile.inventory = [];
        
        u.profile.inventory.push({ 
            id: realItem.id, 
            name: realItem.name, 
            date: new Date().toISOString() 
        });

        // 2. Зберігаємо в Firebase через нову функцію
        await saveUserData(u);

        // 3. Оновлюємо інтерфейс
        localStorage.setItem("currentUser", JSON.stringify(u)); // оновлюємо кеш
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
        return `
            <div class="reward-column">
                <div class="section-sub-header">${title}</div>
                <div class="inventory-column-content">${contentHtml}</div>
            </div>`;
    };
    listEl.innerHTML += createColumn("Мої Мікро-нагороди", shopDB.micro);
    listEl.innerHTML += createColumn("Мої Середні нагороди", shopDB.medium);
    listEl.innerHTML += createColumn("Мої Великі нагороди", shopDB.large);
}

function renderLeaderboard(currentUser) {
    const container = document.getElementById("view-leaderboard");
    if (!container) return;
    if (leaderboardUnsubscribe) {
        leaderboardUnsubscribe();
        leaderboardUnsubscribe = null;
    }
    container.innerHTML = `
        <div class="page-header-container">
            <h2 class="page-header-title">🏆 Рейтинг Класу ${currentUser.className || ""}</h2>
            <div class="page-header-line"></div>
            <p class="page-header-description">Змагайтеся з однокласниками! Рейтинг оновлюється в реальному часі.</p>
        </div>
        <div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; min-height: 300px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <table class="leaderboard-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                <thead>
                    <tr style="color: #ccc; text-align: left; text-transform: uppercase; font-size: 0.9em;">
                        <th style="padding: 10px 20px;">#</th>
                        <th style="width: 50%;">Учень</th> 
                        <th style="width: 30%;">Золото</th>
                    </tr>
                </thead>
                <tbody id="leaderboard-body">
                    <tr><td colspan="3" style="text-align:center; color:#777; padding: 30px;">Завантаження рейтингу... ⏳</td></tr>
                </tbody>
            </table>
        </div>
    `;
    const tbody = document.getElementById("leaderboard-body");
    const q = query(
        collection(db, "users"), 
        where("role", "==", "student"), 
        where("className", "==", currentUser.className), 
        where("teacherUid", "==", currentUser.teacherUid)
    );
    leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
        let mates = [];
        snapshot.forEach((d) => {
            mates.push({ 
                ...d.data(), 
                uid: d.id, 
                cleanGold: Number(d.data().profile?.gold) || 0 
            });
        });
        mates.sort((a, b) => b.cleanGold - a.cleanGold);
        if (mates.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#777;">Клас пустий...</td></tr>`; 
            return; 
        }
        tbody.innerHTML = "";
        mates.forEach((s, i) => {
            let rC = "rank-other", rI = `#${i+1}`;
            if (i === 0) { rC = "rank-1"; rI = "👑 1"; } 
            else if (i === 1) { rC = "rank-2"; rI = "🥈 2"; } 
            else if (i === 2) { rC = "rank-3"; rI = "🥉 3"; }
            let ava = s.profile?.avatar || DEFAULT_AVATAR;
            if (ava.includes('assets/avatars/')) ava = ava.replace('assets/avatars/', 'assets/img/');
            tbody.innerHTML += `
                <tr class="${rC} ${s.uid === currentUser.uid ? 'is-current-user' : ''}">
                    <td class="rank-col">${rI}</td>
                    <td class="name-col" style="display: flex; align-items: center; gap: 15px;">
                        <img src="${ava}" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1);">
                        ${s.name}
                    </td>
                    <td class="gold-col">${s.cleanGold} 💰</td>
                </tr>`;
        });
    });
}