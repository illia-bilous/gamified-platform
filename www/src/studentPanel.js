import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList } from "./shopData.js";
import { db } from "./firebase.js"; 

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
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let leaderboardUnsubscribe = null;
let cachedShopItems = null;

const DEFAULT_AVATAR = 'assets/img/base.png';
const AVAILABLE_AVATARS = [ 'assets/img/boy.png', 'assets/img/girl.png' ];

window.currentTopicId = null; 

// ==========================================
// 🎮 ЗАПУСК UNITY (ВИПРАВЛЕНО)
// ==========================================
export function setupUnityUI() {
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (startBtn) {
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);

        newBtn.onclick = () => {
            const user = getCurrentUser(); // Ваша функція отримання юзера
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

                    // 👇 СПРОЩЕНИЙ ОБРОБНИК
                    const messageHandler = (event) => {
                    if (event.source !== iframe.contentWindow) return;

                    console.log("📨 [JS] Отримано від Unity:", event.data);

                    // 1. Unity просить конфіг
                    if (event.data && (event.data.type === "REQUEST_CONFIG" || event.data.type === "UNITY_READY")) {
                        const topicName = event.data.topic || "Fractions";
                        const levelRequest = event.data.level || 1;
                        
                        console.log(`🧐 Unity хоче: Тема=${topicName}, Рівень=${levelRequest}`);
                        fetchAndSendConfig(user.teacherUid, topicName, levelRequest);
                    }

                    // 2. Рівень пройдено
                    else if (event.data && typeof event.data === "string" && event.data.startsWith("LEVEL_COMPLETE|")) {
                        try {
                            const jsonPart = event.data.split("|")[1];
                            const resultData = JSON.parse(jsonPart);
                            
                            console.log("🏆 Рівень пройдено (зберігаємо в БД):", resultData);
                            saveGameResult(resultData, user); 
                            
                        } catch(e) { console.error("JSON Error:", e); }
                    }

                    // 🔥 3. ДОДАНО: ОБРОБКА КНОПКИ ВИХІД З UNITY 🔥
                    else if (event.data && event.data.type === "CLOSE_GAME") {
                        console.log("🛑 Unity попросило закрити гру.");
                        window.closeUnityGame(); // Викликаємо твою існуючу функцію закриття
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
// 📡 ФУНКЦІЯ ВІДПРАВКИ КОНФІГУ
// ==========================================
// 👇 ПРОСТА ВЕРСІЯ: Ніяких перевірок і заборон. 
// Просто шукаємо те, що просить Unity.
async function fetchAndSendConfig(teacherId, topic, level) {
    if (!teacherId) {
        console.error("❌ fetchAndSendConfig: Немає teacherId!");
        return;
    }

    console.log(`🔍 [JS] Шукаємо дані: Вчитель=${teacherId}, Тема=${topic}, Рівень=${level}`);

    try {
        const docRef = doc(db, "teacher_configs", teacherId);
        const docSnap = await getDoc(docRef);

        // 1. ОГОЛОШУЄМО ЗМІННІ ТУТ (Щоб вони були видимі всюди)
        let finalQuestion = "2 + 2";
        let finalAnswer = "4";
        let finalTime = 60;
        let finalReward = 50;
        // 👇 ОГОЛОШУЄМО МАСИВ ЗАЗДАЛЕГІДЬ!
        let finalWrongAnswers = ["1", "2", "3", "5"]; 

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Перевіряємо, чи є така тема
            if (data[topic]) {
                const topicData = data[topic];
                
                // Налаштування теми
                if (topicData.timeLimit) finalTime = Number(topicData.timeLimit);
                if (topicData.reward) finalReward = Number(topicData.reward);

                // Шукаємо конкретний рівень
                let levelData = null;
                
                if (topicData.doors && Array.isArray(topicData.doors)) {
                    levelData = topicData.doors.find(d => d.id == level || d.level == level);
                } 
                else if (Array.isArray(topicData)) {
                    levelData = topicData.find(l => l.id == level);
                }

                // Якщо знайшли дані рівня - перезаписуємо
                if (levelData) {
                    if (levelData.question) finalQuestion = levelData.question;
                    if (levelData.answer) finalAnswer = String(levelData.answer);
                    if (levelData.reward) finalReward = Number(levelData.reward);
                    if (levelData.timeLimit) finalTime = Number(levelData.timeLimit);
                    
                    // 👇 ЯКЩО В БАЗІ Є НЕПРАВИЛЬНІ ВІДПОВІДІ - БЕРЕМО ЇХ
                    if (levelData.wrongAnswers && Array.isArray(levelData.wrongAnswers) && levelData.wrongAnswers.length > 0) {
                        finalWrongAnswers = levelData.wrongAnswers;
                    }
                } else {
                    console.warn(`⚠️ Рівень ${level} не знайдено, використовую дефолт.`);
                }
            }
        }

        // 🔥 ФОРМУВАННЯ ПАКЕТУ ДЛЯ UNITY 🔥
        const simplePayload = {
            question: finalQuestion,
            answer: finalAnswer,
            wrongAnswers: finalWrongAnswers, // Тепер ця змінна точно існує
            time: finalTime,
            reward: finalReward
        };

        const jsonString = JSON.stringify(simplePayload);
        console.log("🚀 [JS -> Unity] Відправляю JSON:", jsonString);

        // 👇 ВІДПРАВКА В UNITY
        const iframe = document.querySelector("#unity-container iframe");
        
        if (window.unityInstance) {
            window.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', jsonString);
        } 
        else if (iframe && iframe.contentWindow) {
             if (iframe.contentWindow.unityInstance) {
                 iframe.contentWindow.unityInstance.SendMessage('MathLevelManager', 'ReceiveConfig', jsonString);
            } else {
                iframe.contentWindow.postMessage(jsonString, "*");
            }
        }

    } catch (error) {
        console.error("🔥 Error in fetchAndSendConfig:", error);
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
        const maxScore = resultData.maxScore || 100; 

        console.log(`🏆 Saving: ${topic}, Lvl: ${level}, Score: ${score}`);

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { "profile.gold": increment(score) });

        await addDoc(collection(db, "users", user.uid, "game_sessions"), {
            topic: topic, level: level, score: score, mistakes: resultData.mistakes || 0,
            timeSpent: resultData.timeSpent || 0, timestamp: serverTimestamp(), win: score > 0 
        });

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
            contentHtml += `<div class="inventory-card-item"><div class="inv-name">${shopItem.name} <span class="item-count">x${count}</span></div><div class="inv-desc">${shopItem.desc}</div></div>`;
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

// ==========================================
// 🛠️ СИСТЕМНІ ФУНКЦІЇ (ОНОВЛЕНО!)
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
}

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) await updateDoc(doc(db, "users", user.uid), { profile: user.profile });
}

// 🔥 ОНОВЛЕНО: ТЕПЕР СЛУХАЄ КОМАНДУ НА "BOMB" (СКИДАННЯ)
function startLiveGoldTracker(userId) {
    console.log("📡 Запущено живий трекер + слухач скидання...");
    const userRef = doc(db, "users", userId);
    
    onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
            const freshData = docSnap.data();

            // 🛑 === ЛОГІКА HARD RESET (CLEAR DATA) === 🛑
            if (freshData.needReset === true) {
                console.warn("🧨 Вчитель активував повне скидання (бомбу)!");
                
                // 1. Знімаємо прапорець у базі, щоб не зациклилось
                await updateDoc(userRef, { needReset: false });
                
                // 2. Видаляємо Unity DB (це і є Clear Data)
                const req = indexedDB.deleteDatabase("/idbfs");
                
                req.onsuccess = () => {
                    console.log("✅ База Unity видалена.");
                    alert("УВАГА: Вчитель повністю скинув ваш ігровий прогрес.");
                    // 3. Перезавантажуємо сторінку
                    location.reload();
                };
                
                req.onerror = () => {
                    console.error("❌ Не вдалося видалити базу.");
                    alert("Спроба скидання не вдалася. Спробуйте очистити кеш вручну.");
                };
                return; // Виходимо, далі нічого не оновлюємо
            }
            // ============================================

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

// ==========================================
// 🛠️ АДМІН-ФУНКЦІЇ (Для тесту через консоль)
// ==========================================

// 1. Просто заборонити рівень (Soft Reset)
window.resetStudentLevel = async (studentId, topic, newLevel) => {
    try {
        const userRef = doc(db, "users", studentId);
        await setDoc(userRef, {
            progress: {
                [topic]: { maxAllowedLevel: newLevel }
            }
        }, { merge: true });
        console.log(`✅ Soft Reset: maxLevel -> ${newLevel}`);
    } catch (e) { console.error(e); }
};

// 2. ПОВНЕ СКИДАННЯ (Hard Reset / Bomb)
window.adminHardReset = async (studentId) => {
    try {
        const userRef = doc(db, "users", studentId);
        // Ставимо мітку, яку зловить startLiveGoldTracker
        await updateDoc(userRef, { needReset: true });
        console.log(`💣 Hard Reset: Відправлено команду знищення даних учню ${studentId}`);
    } catch (e) { console.error(e); }
};
