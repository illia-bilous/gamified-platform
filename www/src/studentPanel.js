import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList } from "./shopData.js";
import { db } from "./firebase.js";
import { sendConfigToUnity } from "./gameBridge.js"; 

import { 
    collection, 
    query, 
    where, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    increment, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let leaderboardUnsubscribe = null;
const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = ['assets/img/boy.png', 'assets/img/girl.png'];
let cachedShopItems = null;

// ==========================================
// 🎮 ЗАПУСК UNITY (ВИПРАВЛЕНО)
// ==========================================
export function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (startBtn) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = async () => {
            const user = await getCurrentUser();
            
            if (!user || !user.teacherUid) {
                alert("Помилка: Не знайдено дані учня або вчителя.");
                return;
            }

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
                    iframe.src = `unity/index.html?v=${Date.now()}`;
                    iframe.style.cssText = "width:100%; height:100%; border:none; min-height: 600px;";
                    iframe.id = "unity-iframe"; 

                    // 👇 ОНОВЛЕНИЙ ОБРОБНИК ПОВІДОМЛЕНЬ
                    const messageHandler = (event) => {
                        console.log("📨 [RAW MESSAGE]:", event.data);

                        if (!event.data) return;

                        let msgType = null;
                        let msgTopic = "Fractions"; 
                        let msgLevel = 1; // 👈 Додали змінну для рівня (за замовчуванням 1)
                        let rawData = event.data;

                        // Спроба розпізнати формат
                        if (typeof rawData === "string") {
                            try {
                                if (rawData.startsWith("LEVEL_COMPLETE|")) {
                                    const jsonPart = rawData.split("|")[1];
                                    const resultData = JSON.parse(jsonPart);
                                    console.log("✅ Рівень пройдено (String format):", resultData);
                                    saveGameResult(resultData, user);
                                    return;
                                }
                                
                                const parsed = JSON.parse(rawData);
                                msgType = parsed.type;
                                if (parsed.topic) msgTopic = parsed.topic;
                                if (parsed.level) msgLevel = parsed.level; // 👈 Витягуємо рівень з JSON рядка
                            } catch (e) {
                                if (rawData === "REQUEST_CONFIG" || rawData === "UNITY_READY") {
                                    msgType = "REQUEST_CONFIG";
                                }
                            }
                        } else if (typeof rawData === "object") {
                            msgType = rawData.type;
                            if (rawData.topic) msgTopic = rawData.topic;
                            if (rawData.level) msgLevel = rawData.level; // 👈 Витягуємо рівень з об'єкта
                        }

                        // 2. Обробка запиту конфігурації
                        if (msgType === "REQUEST_CONFIG" || msgType === "UNITY_READY") {
                            console.log(`🧐 Unity просить тему: ${msgTopic}, Рівень: ${msgLevel}`);
                            
                            // 🔥 ПЕРЕДАЄМО msgLevel У GAMEBRIDGE
                            sendConfigToUnity(msgTopic, user.teacherUid, user.uid, msgLevel);
                        }

                        // 3. Обробка результату гри
                        if (msgType === "LEVEL_COMPLETE") {
                            console.log("✅ Рівень пройдено (Object format):", rawData);
                            saveGameResult(rawData, user);
                        }
                    };
                    
                    window.addEventListener("message", messageHandler);
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
                iframe.src = ""; 
                iframe.remove();
            }
        }
        const closeBtn = document.getElementById("btn-force-close-unity");
        if (closeBtn) closeBtn.remove();
        
        const currentStartBtn = document.getElementById("btn-start-lesson");
        if (currentStartBtn) currentStartBtn.style.display = "inline-block"; 
    };
}

// ==========================================
// 💾 ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТУ
// ==========================================
export async function saveGameResult(resultData, user) {
    if (!user) { console.error("❌ saveGameResult: Немає юзера"); return; }
    try {
        const score = Number(resultData.score || 0);
        const topic = resultData.topic || "Unknown";
        const level = Number(resultData.level) || 1; 
        const maxScore = resultData.maxScore || 100; 

        console.log(`🏆 Saving: ${topic}, Lvl: ${level}, Score: ${score}`);

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { "profile.gold": increment(score) });

        await addDoc(collection(db, "users", user.uid, "game_sessions"), {
            topic: topic, level: level, score: score, mistakes: resultData.mistakes || 0,
            timeSpent: resultData.timeSpent || 0, timestamp: serverTimestamp(), win: score > 0 
        });

        const statsRef = doc(db, "game_results", user.uid);
        const statsSnap = await getDoc(statsRef);
        let statsData = statsSnap.exists() ? statsSnap.data() : { topics: {} };
        if (!statsData.topics) statsData.topics = {};
        
        const currentStats = statsData.topics[topic] || { bestScore: 0, attempts: 0, level: 1 };
        
        // Логіка відкриття нових рівнів
        let newLevel = Number(currentStats.level || 1);
        if (score > 0 && level >= newLevel) {
            newLevel = level + 1;
        }

        const updates = {
            [`topics.${topic}.lastScore`]: score,
            [`topics.${topic}.bestScore`]: Math.max((currentStats.bestScore || 0), score),
            [`topics.${topic}.attempts`]: (currentStats.attempts || 0) + 1,
            [`topics.${topic}.lastPlayed`]: new Date().toISOString(),
            [`topics.${topic}.maxPossibleScore`]: maxScore,
            [`topics.${topic}.level`]: newLevel,
            "studentName": user.displayName || "Учень",
            "classId": user.classId || ""
        };

        if (!statsSnap.exists()) {
            await setDoc(statsRef, { 
                studentId: user.uid,
                topics: { [topic]: { lastScore: score, bestScore: score, attempts: 1, lastPlayed: new Date().toISOString(), maxPossibleScore: maxScore, level: (score > 0 ? 2 : 1) } }
            });
        } else {
            await updateDoc(statsRef, updates);
        }

        const goldDisplay = document.getElementById("student-gold-display");
        if(goldDisplay) {
            const currentGold = parseInt(goldDisplay.innerText.replace(/\D/g, '') || "0");
            goldDisplay.innerText = `${currentGold + score} 💰`;
        }
    } catch (e) { console.error("❌ Save Error:", e); }
}

// ==========================================
// 🦁 ІНШІ ФУНКЦІЇ (Залишились без змін)
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
        div.innerHTML = `<div class="shop-item-row"><div class="item-name">${item.name}</div><div class="item-price">${item.price} 💰</div></div><div class="item-desc">${item.desc}</div><button class="btn-buy" data-id="${item.id}">Купити</button>`;
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
    if (userInv.length === 0) { listEl.innerHTML = '<li class="empty-msg" style="width:100%; text-align:center;">Поки що пусто...</li>'; listEl.style.display = "block"; return; }
    listEl.className = "treasury-grid"; listEl.style.display = "flex"; listEl.innerHTML = "";
    const shopDB = cachedShopItems || { micro: [], medium: [], large: [] };
    const createColumn = (title, dbItems) => {
        const safeItems = dbItems || [];
        const itemsInCat = safeItems.filter(shopItem => userInv.some(uItem => uItem.name === shopItem.name));
        let contentHtml = itemsInCat.length === 0 ? `<div class="inv-empty-category">Пусто...</div>` : "";
        itemsInCat.forEach(shopItem => {
            const count = userInv.filter(uItem => uItem.name === shopItem.name).length;
            contentHtml += `<div class="inventory-card-item"><div class="inv-name">${shopItem.name} <span class="item-count">x${count}</span></div><div class="inv-desc">${shopItem.desc}</div></div>`;
        });
        return `<div class="reward-column"><div class="section-sub-header">${title}</div><div class="inventory-column-content">${contentHtml}</div></div>`;
    };
    listEl.innerHTML += createColumn("Мої Мікро-нагороди", shopDB.micro);
    listEl.innerHTML += createColumn("Мої Середні нагороди", shopDB.medium);
    listEl.innerHTML += createColumn("Мої Великі нагороди", shopDB.large);
}

function renderLeaderboard(currentUser) {
    const container = document.getElementById("view-leaderboard");
    if (!container) return;
    if (leaderboardUnsubscribe) { leaderboardUnsubscribe(); leaderboardUnsubscribe = null; }
    container.innerHTML = `<div class="page-header-container"><h2 class="page-header-title">🏆 Рейтинг Класу ${currentUser.className || ""}</h2><div class="page-header-line"></div><p class="page-header-description">Змагайтеся з однокласниками!</p></div><div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; min-height: 300px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"><table class="leaderboard-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;"><thead><tr style="color: #ccc; text-align: left; text-transform: uppercase; font-size: 0.9em;"><th style="padding: 10px 20px;">#</th><th style="width: 50%;">Учень</th><th style="width: 30%;">Золото</th></tr></thead><tbody id="leaderboard-body"><tr><td colspan="3" style="text-align:center; color:#777; padding: 30px;">Завантаження... ⏳</td></tr></tbody></table></div>`;
    const tbody = document.getElementById("leaderboard-body");
    const q = query(collection(db, "users"), where("role", "==", "student"), where("className", "==", currentUser.className), where("teacherUid", "==", currentUser.teacherUid));
    leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
        let mates = [];
        snapshot.forEach((d) => mates.push({ ...d.data(), uid: d.id, cleanGold: Number(d.data().profile?.gold) || 0 }));
        mates.sort((a, b) => b.cleanGold - a.cleanGold);
        if (mates.length === 0) { tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#777;">Клас пустий...</td></tr>`; return; }
        tbody.innerHTML = "";
        mates.forEach((s, i) => {
            let rC = "rank-other", rI = `#${i+1}`;
            if (i===0) {rC="rank-1";rI="👑 1";} else if(i===1){rC="rank-2";rI="🥈 2";} else if(i===2){rC="rank-3";rI="🥉 3";}
            let ava = s.profile?.avatar || DEFAULT_AVATAR;
            if (ava.includes('assets/avatars/')) ava = ava.replace('assets/avatars/', 'assets/img/');
            tbody.innerHTML += `<tr class="${rC} ${s.uid===currentUser.uid?'is-current-user':''}"><td class="rank-col" style="font-weight:bold; font-size: 1.2em;">${rI}</td><td class="name-col" style="font-size: 1.2em; color: white; display: flex; align-items: center; gap: 15px;"><img src="${ava}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #555;">${s.name}</td><td class="gold-col" style="color: #f1c40f; font-weight: 800; font-size: 1.2em;">${s.cleanGold} 💰</td></tr>`;
        });
    });
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
    if (goldEl) goldEl.textContent = currentUser.profile.gold;
    renderInventory(currentUser);
}

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) await updateDoc(doc(db, "users", user.uid), { profile: user.profile });
}

function startLiveGoldTracker(userId) {
    onSnapshot(doc(db, "users", userId), (docSnap) => {
        if (docSnap.exists()) {
            let user = getCurrentUser();
            user.profile = docSnap.data().profile;
            localStorage.setItem("currentUser", JSON.stringify(user));
            updateHomeDisplay(user);
        }
    });
}

export async function initStudentPanel() {
    let user = getCurrentUser();
    if (!user) return;
    startLiveGoldTracker(user.uid);
    try { cachedShopItems = await getShopItems(user.teacherUid); } catch (e) { cachedShopItems = { micro: [], medium: [], large: [] }; }
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

window.saveGameResult = saveGameResult;