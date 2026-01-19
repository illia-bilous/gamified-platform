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
    getDoc, 
    updateDoc, 
    onSnapshot, 
    addDoc, 
    serverTimestamp,
    orderBy,  
    limit,     
    increment // 🔥 Залишив один раз (у тебе було двічі)
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let leaderboardUnsubscribe = null;
let diaryUnsubscribe = null; 
let cachedShopItems = null;

// 🔥 ПРАПОРЕЦЬ ЗАХИСТУ ВІД ДУБЛІВ
let isProcessingReward = false; 

const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = [ 'assets/img/boy.png', 'assets/img/girl.png' ];

window.currentTopicId = null; 

// ==========================================
// 🎮 ГЛОБАЛЬНИЙ СЛУХАЧ UNITY (ОДИН НА ВЕСЬ ФАЙЛ)
// ==========================================
window.addEventListener("message", (event) => {
    const iframe = document.getElementById("unity-iframe");
    if (!iframe || event.source !== iframe.contentWindow) return;

    // console.log("📨 [JS] Отримано від Unity:", event.data); // Можна розкоментувати для дебагу
    const user = getCurrentUser();

    // 1. Unity просить конфіг (ГРА)
    if (event.data && (event.data.type === "REQUEST_CONFIG" || event.data.type === "UNITY_READY")) {
        if (user) {
            const topicName = event.data.topic || "Fractions";
            const levelRequest = event.data.level || 1;
            sendConfigToUnity(topicName, user.teacherUid, user.uid, levelRequest);
        }
    }

    // 1.5. Unity просить ліміт (МЕНЮ)
    else if (event.data && event.data.type === "REQUEST_TEACHER_LIMIT") {
        if (user) {
            const currentTopic = window.currentTopicId || "Fractions";
            let limit = 99;
            if (user.progress?.[currentTopic]?.maxAllowedLevel) {
                limit = parseInt(user.progress[currentTopic].maxAllowedLevel);
            }
            if (iframe.contentWindow.unityInstance) {
                iframe.contentWindow.unityInstance.SendMessage("MenuController", "SetTeacherLimit", limit);
            } else {
                 try { window.unityGame.SendMessage("MenuController", "SetTeacherLimit", limit); } catch(e){}
            }
        }
    }

    // 2. Рівень пройдено (ЩОДЕННИК)
    else if (event.data && typeof event.data === "string" && event.data.startsWith("LEVEL_COMPLETE|")) {
        // 🔥 ЗАХИСТ ВІД ПОДВІЙНОГО НАРАХУВАННЯ
        if (isProcessingReward) {
            console.warn("🚫 Ігноруємо дубль повідомлення про перемогу.");
            return;
        }

        if (user) {
            try {
                // Блокуємо повторні виклики на 2 секунди
                isProcessingReward = true;
                setTimeout(() => { isProcessingReward = false; }, 2000);

                const jsonPart = event.data.split("|")[1];
                const resultData = JSON.parse(jsonPart);
                
                console.log("🏆 Рівень пройдено (Обробка...):", resultData);
                saveGameResult(resultData, user);

            } catch (e) { 
                console.error("JSON Error:", e); 
                isProcessingReward = false; // Знімаємо блок у разі помилки
            }
        }
    }

    // 3. Закриття гри
    else if (event.data && event.data.type === "CLOSE_GAME") {
        closeUnityGameUI();
    }
});

// Допоміжна функція закриття інтерфейсу
function closeUnityGameUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");
    const closeBtn = document.getElementById("btn-force-close-unity");

    if (unityContainer) unityContainer.classList.add("hidden");
    if (startBtn) startBtn.style.display = "block"; 
    if (closeBtn) closeBtn.remove(); 
}
window.closeUnityGame = closeUnityGameUI;

// ==========================================
// 🎮 НАЛАШТУВАННЯ UI
// ==========================================
export function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");
    
    let iframe = document.getElementById("unity-iframe");
    if (!iframe && unityContainer) {
        iframe = document.createElement("iframe");
        iframe.id = "unity-iframe";
        iframe.style.cssText = "width:100%; height:100%; border:none; min-height: 600px;";
        unityContainer.appendChild(iframe);
    }

    if (startBtn && unityContainer && iframe) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            console.log("🚀 Кнопку СТАРТ натиснуто!");
            const user = getCurrentUser();

            if (!user) return alert("Ви не авторизовані!");
            if (!user.teacherUid) return alert("Помилка: Не прив'язаний вчитель.");

            unityContainer.classList.remove("hidden");
            newBtn.style.display = "none";

            if (!document.getElementById("btn-force-close-unity")) {
                const closeBtn = document.createElement("button");
                closeBtn.id = "btn-force-close-unity";
                closeBtn.innerText = "✖ Закрити гру";
                closeBtn.style.cssText = "margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px 15px; cursor: pointer; float: right; border-radius: 5px; font-weight: bold;";
                closeBtn.onclick = () => closeUnityGameUI();
                unityContainer.parentNode.insertBefore(closeBtn, unityContainer);
            }

            console.log("🔄 Завантажую Unity...");
            iframe.src = `unity/index.html?v=${Date.now()}`;
        };
    } else {
        console.warn("⚠️ setupUnityUI: Не знайдено кнопку старт або контейнер unity");
    }
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
        const grade = Number(resultData.grade || 0);
        const mistakes = Number(resultData.mistakes || 0);
        const timeSpent = Number(resultData.timeSpent || 0);

        console.log(`💾 Saving to DB -> Topic: ${topic}, Grade: ${grade}, Gold: ${score}`);

        const userRef = doc(db, "users", user.uid);
        
        // 1. Атомарне додавання золота (найнадійніший спосіб)
        await updateDoc(userRef, { "profile.gold": increment(score) });

        // 2. Запис в історію
        await addDoc(collection(db, "users", user.uid, "game_sessions"), {
            topic: topic, 
            level: level, 
            score: score, 
            grade: grade,       
            mistakes: mistakes, 
            timeSpent: timeSpent, 
            timestamp: serverTimestamp(), 
            win: score > 0 
        });

        // 🔥 МИ ПРИБРАЛИ РУЧНЕ ОНОВЛЕННЯ goldDisplay ТУТ
        // Тому що startLiveGoldTracker автоматично побачить updateDoc і оновить UI.
        // Це усуне "стрибки" цифр.

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
            
            let dateStr = "--/--";
            if (d.timestamp) dateStr = d.timestamp.toDate().toLocaleString('uk-UA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            const m = Math.floor(d.timeSpent / 60);
            const s = d.timeSpent % 60;
            const timeStr = `${m}хв ${s}с`;

            let gradeColor = "#e74c3c"; 
            if (d.grade >= 10) gradeColor = "#2ecc71"; 
            else if (d.grade >= 7) gradeColor = "#f1c40f"; 
            else if (d.grade >= 4) gradeColor = "#e67e22"; 

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

function translateTopic(topic) {
    if (!topic) return "Невідома тема";
    const t = topic.toLowerCase(); 
    if(t === "fractions") return "Дроби";
    if(t === "powers") return "Степені";
    if(t === "quadratics") return "Рівняння";
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
                return; 
            }

            // ОНОВЛЮЄМО ВСЕ АВТОМАТИЧНО
            let user = getCurrentUser();
            user.profile = docSnap.data().profile;
            localStorage.setItem("currentUser", JSON.stringify(user));
            updateHomeDisplay(user); // Це оновить і золото, і інвентар
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