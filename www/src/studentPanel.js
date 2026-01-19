import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList } from "./shopData.js";
import { db } from "./firebase.js"; 
import { sendConfigToUnity } from "./gameBridge.js"; // 🔥 ІМПОРТУЄМО БРИДЖ

import { 
    collection, 
    query, 
    where,  
    setDoc, 
    doc, 
    getDoc, 
    updateDoc, 
    onSnapshot, 
    increment, 
    addDoc, 
    serverTimestamp,
    orderBy,  // 🔥 Для сортування щоденника
    limit     // 🔥 Щоб не вантажити мільйон записів
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let leaderboardUnsubscribe = null;
let diaryUnsubscribe = null; // 🔥 Для відписки від щоденника
let cachedShopItems = null;

const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = [ 'assets/img/boy.png', 'assets/img/girl.png' ];

window.currentTopicId = null; 

// ==========================================
// 🎮 ЗАПУСК UNITY
// ==========================================
export function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (startBtn) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            const user = getCurrentUser(); 
            if (!user || !user.teacherUid) return alert("Помилка: Немає ID вчителя.");

            if (unityContainer) {
                unityContainer.classList.remove("hidden");
                newBtn.style.display = "none";

                // Кнопка закриття
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

                    const messageHandler = (event) => {
                        if (event.source !== iframe.contentWindow) return;

                        console.log("📨 [JS] Отримано від Unity:", event.data);

                        // 1. Unity просить конфіг (ГРА)
                        if (event.data && (event.data.type === "REQUEST_CONFIG" || event.data.type === "UNITY_READY")) {
                            const topicName = event.data.topic || "Fractions";
                            const levelRequest = event.data.level || 1;
                            
                            // 🔥 ВИКЛИКАЄМО ФУНКЦІЮ З GAMEBRIDGE
                            sendConfigToUnity(topicName, user.teacherUid, user.uid, levelRequest);
                        }

                        // 🔥 1.5. Unity просить ліміт (МЕНЮ)
                        else if (event.data && event.data.type === "REQUEST_TEACHER_LIMIT") {
                            console.log("👮 [JS] Unity запитує ліміт...");
                            
                            // Визначаємо тему (якщо змінної немає, ставимо дефолт)
                            const currentTopic = window.currentTopicId || "Fractions"; 
                            let limit = 99; // За замовчуванням відкрито все

                            // Перевіряємо базу даних користувача
                            if (user.progress && user.progress[currentTopic] && user.progress[currentTopic].maxAllowedLevel) {
                                limit = parseInt(user.progress[currentTopic].maxAllowedLevel);
                            }

                            console.log(`📤 Відправляю ліміт у Unity: ${limit} для теми ${currentTopic}`);

                            // Відправка назад у Unity
                            if (iframe.contentWindow.unityInstance) {
                                iframe.contentWindow.unityInstance.SendMessage("MenuController", "SetTeacherLimit", limit);
                            } else if (window.unityInstance) {
                                window.unityInstance.SendMessage("MenuController", "SetTeacherLimit", limit);
                            }
                        }

                        // 2. Рівень пройдено (ЩОДЕННИК)
                        else if (event.data && typeof event.data === "string" && event.data.startsWith("LEVEL_COMPLETE|")) {
                            try {
                                const jsonPart = event.data.split("|")[1];
                                const resultData = JSON.parse(jsonPart);
                                console.log("🏆 Рівень пройдено:", resultData);
                                saveGameResult(resultData, user); 
                            } catch(e) { console.error("JSON Error:", e); }
                        }

                        // 3. Закриття
                        else if (event.data && event.data.type === "CLOSE_GAME") {
                            window.closeUnityGame(); 
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
// 💾 ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТІВ
// ==========================================
async function saveGameResult(resultData, user) {
    if (!user) return;
    try {
        const score = Number(resultData.score || 0);
        const topic = resultData.topic || "Unknown";
        const level = Number(resultData.level) || 1; 
        
        // 🔥 ВИПРАВЛЕННЯ: Тепер зберігаємо grade (оцінку)
        const grade = Number(resultData.grade || 0);
        const mistakes = Number(resultData.mistakes || 0);
        const timeSpent = Number(resultData.timeSpent || 0);

        console.log(`🏆 Saving to DB -> Topic: ${topic}, Grade: ${grade}, Gold: ${score}`);

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { "profile.gold": increment(score) });

        // Запис у колекцію game_sessions
        await addDoc(collection(db, "users", user.uid, "game_sessions"), {
            topic: topic, 
            level: level, 
            score: score, 
            grade: grade,       // ✅ ТЕПЕР ЗБЕРІГАЄТЬСЯ
            mistakes: mistakes, // ✅ ТЕПЕР ЗБЕРІГАЄТЬСЯ
            timeSpent: timeSpent, 
            timestamp: serverTimestamp(), 
            win: score > 0 
        });

        const goldDisplay = document.getElementById("student-gold-display");
        if(goldDisplay) {
            const currentGold = parseInt(goldDisplay.innerText.replace(/\D/g, '') || "0");
            goldDisplay.innerText = `${currentGold + score} 💰`;
        }
    } catch (e) { console.error("❌ Save Error:", e); }
}

// ==========================================
// 📓 ЩОДЕННИК
// ==========================================
function renderStudentDiary(currentUser) {
    const container = document.getElementById("view-diary");
    if (!container) return;

    if (diaryUnsubscribe) {
        diaryUnsubscribe();
        diaryUnsubscribe = null;
    }

    container.innerHTML = `
        <div class="page-header-container">
            <h2 class="page-header-title">📔 Мій Щоденник</h2>
            <div class="page-header-line"></div>
            <p class="page-header-description">Історія твоїх успіхів та оцінок.</p>
        </div>
        
        <div class="leaderboard-wrapper" style="max-height: 500px; overflow-y: auto;">
            <table class="leaderboard-table" style="width: 100%; text-align: left;">
                <thead>
                    <tr style="color: #f1c40f;">
                        <th style="padding:10px;">Дата</th>
                        <th>Тема</th>
                        <th>Рівень</th>
                        <th>Час</th>
                        <th>Помилки</th>
                        <th>Оцінка</th>
                        <th>Золото</th>
                    </tr>
                </thead>
                <tbody id="diary-tbody">
                    <tr><td colspan="7" style="text-align:center; padding:20px; color:#aaa;">Завантаження...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById("diary-tbody");

    // Сортуємо по часу (найновіші зверху), беремо останні 50 записів
    const q = query(
        collection(db, "users", currentUser.uid, "game_sessions"), 
        orderBy("timestamp", "desc"), 
        limit(50)
    );

    diaryUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#aaa;">Історія порожня. Зіграй першу гру!</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            
            // Форматування дати
            let dateStr = "--/--";
            if (d.timestamp) dateStr = d.timestamp.toDate().toLocaleString('uk-UA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            // Форматування часу проходження
            const m = Math.floor(d.timeSpent / 60);
            const s = d.timeSpent % 60;
            const timeStr = `${m}хв ${s}с`;

            // Колір оцінки
            let gradeColor = "#e74c3c"; // Червоний (погано)
            if (d.grade >= 10) gradeColor = "#2ecc71"; // Зелений (відмінно)
            else if (d.grade >= 7) gradeColor = "#f1c40f"; // Жовтий (добре)
            else if (d.grade >= 4) gradeColor = "#e67e22"; // Оранжевий (так собі)

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding:10px; color:#ccc;">${dateStr}</td>
                    <td style="color:white; font-weight:bold;">${translateTopic(d.topic)}</td>
                    <td style="text-align:center;">${d.level}</td>
                    <td style="color:#aaa;">${timeStr}</td>
                    <td style="text-align:center; color:#e74c3c;">${d.mistakes}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.2em; color:${gradeColor};">${d.grade || 0}</td>
                    <td style="text-align:center; color:#f1c40f;">+${d.score}</td>
                </tr>
            `;
        });
    });
}

// Допоміжна функція перекладу тем
function translateTopic(topic) {
    if(topic === "Fractions") return "Дроби";
    if(topic === "Powers") return "Степені";
    if(topic === "Quadratics") return "Рівняння";
    return topic;
}

// ==========================================
// 🛠️ СИСТЕМНІ ФУНКЦІЇ
// ==========================================
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
    
    // 🔥 Рендеримо щоденник при оновленні
    renderStudentDiary(currentUser);
}

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) await updateDoc(doc(db, "users", user.uid), { profile: user.profile });
}

function startLiveGoldTracker(userId) {
    console.log("📡 Запущено живий трекер + слухач скидання...");
    const userRef = doc(db, "users", userId);
    
    onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
            const freshData = docSnap.data();

            if (freshData.needReset === true) {
                console.warn("🧨 Вчитель активував повне скидання!");
                await updateDoc(userRef, { needReset: false });
                const req = indexedDB.deleteDatabase("/idbfs");
                req.onsuccess = () => {
                    alert("УВАГА: Вчитель повністю скинув ваш ігровий прогрес.");
                    location.reload();
                };
                req.onerror = () => {
                    alert("Спроба скидання не вдалася. Спробуйте очистити кеш вручну.");
                };
                return; 
            }

            let user = getCurrentUser();
            user.profile = docSnap.data().profile;
            localStorage.setItem("currentUser", JSON.stringify(user));
            updateHomeDisplay(user);
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
    try { cachedShopItems = await getShopItems(user.teacherUid); } catch (e) { cachedShopItems = { micro: [], medium: [], large: [] }; }
    
    // Ініціалізація компонентів
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
// 🛠️ АДМІН-ФУНКЦІЇ
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

// ==========================================
// 🛍️ ФУНКЦІЇ МАГАЗИНУ ТА ІНВЕНТАРЯ
// ==========================================

function setupAvatarSystem(user) {
    const editBtn = document.getElementById("btn-edit-avatar");
    if (editBtn) {
        // Клонуємо кнопку, щоб зняти старі слухачі подій
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

function buyItem(visualItem) {
    let u = getCurrentUser();
    const realItem = findItemInList(cachedShopItems, visualItem.id);
    
    if (!realItem) return;

    if (u.profile.gold >= realItem.price) {
        if (!confirm(`Купити "${realItem.name}" за ${realItem.price} золота?`)) return;

        u.profile.gold -= realItem.price;
        
        if (!u.profile.inventory) u.profile.inventory = [];
        
        u.profile.inventory.push({ 
            id: realItem.id, 
            name: realItem.name, 
            date: new Date().toISOString() 
        });

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

// ==========================================
// 🏆 ЛІДЕРБОРД
// ==========================================

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
    
    // Запит: Тільки учні, тільки цей клас, тільки цей вчитель
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

        // Сортування: хто багатший - той вище
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