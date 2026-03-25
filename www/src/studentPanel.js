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
    increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemInList, FALLBACK_ITEMS } from "./shopData.js";
import { db } from "./firebase.js";
import {
    sendConfigToUnity,
    nextCalendarDayAfterKyivToday,
    isExamTopicLockedByDate
} from "./gameBridge.js";
import { normalizeTopicKey } from "./mathTrainingGenerator.js";

function getLaunchGameMode() {
    const m = String(window.__mathMazeGameMode || "").toLowerCase().trim();
    return m === "training" ? "training" : "exam";
}

function resolveTopicKeyForProgress(userData, topicRaw) {
    const keys = Object.keys(userData?.progress || {});
    const t = String(topicRaw || "Fractions");
    const found = keys.find((k) => k.toLowerCase() === t.toLowerCase());
    if (found) return found;
    const canon = normalizeTopicKey(topicRaw);
    const byCanon = keys.find((k) => k.toLowerCase() === canon.toLowerCase());
    if (byCanon) return byCanon;
    return canon;
}

// Глобальні змінні стану
let leaderboardUnsubscribe = null;
let diaryUnsubscribe = null; 
let goldTrackerUnsubscribe = null;
let cachedShopItems = null;
let isProcessingReward = false; 
let shopUnsubscribe = null;

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
            console.log(`🎮 Запит конфігурації: ${topicName}, рівень ${levelRequest}, режим ${getLaunchGameMode()}`);
            
            sendConfigToUnity(topicName, user.teacherUid, user.uid, levelRequest, getLaunchGameMode());
        }
    }

    // 2. Запит ліміту рівня від вчителя (єдиний обробник — інакше два postMessage дають гонку й «3/4» на одній темі)
    else if (event.data && event.data.type === "REQUEST_TEACHER_LIMIT") {
        const requestedTopic = event.data.topic || "Fractions";
        const uid = user?.uid || localStorage.getItem("studentUid");
        if (!uid) return;

        const userDocRef = doc(db, "users", uid);

        getDoc(userDocRef).then((docSnap) => {
            const mode = getLaunchGameMode();
            let limitVal = 1;

            if (mode === "training") {
                limitVal =
                    docSnap.exists() && docSnap.data().progress?.allTopicsBlocked === true ? 1 : 992;
            } else if (docSnap.exists()) {
                const data = docSnap.data();
                if (isExamTopicLockedByDate(data, requestedTopic)) {
                    limitVal = 0;
                } else {
                    const tKey = resolveTopicKeyForProgress(data, requestedTopic);
                    if (data.progress && data.progress[tKey]) {
                        limitVal = data.progress[tKey].maxAllowedLevel || 1;
                    }
                }
                if (data.progress?.allTopicsBlocked === true) {
                    limitVal = 0;
                }
            }

            console.log(`📡 Ліміт для ${requestedTopic} (${mode}): ${limitVal}`);
            const target = iframe.contentWindow.unityInstance || window.unityGame;
            if (target) target.SendMessage("MenuController", "SetTeacherLimit", limitVal);
        });
    }

    // 2b. Програш у «Забігу» (надсилає Unity WebGL, якщо додано виклик postMessage)
    else if (event.data && typeof event.data === "string" && event.data.startsWith("EXAM_LEVEL_FAILED|")) {
        if (!user || getLaunchGameMode() !== "exam") return;
        (async () => {
            try {
                const payload = JSON.parse(event.data.split("|")[1]);
                const topicRaw = payload.topic || "Fractions";
                const userRef = doc(db, "users", user.uid);
                const snap = await getDoc(userRef);
                if (!snap.exists()) return;
                const topicKey = resolveTopicKeyForProgress(snap.data(), topicRaw);
                const unlockDay = nextCalendarDayAfterKyivToday();
                await updateDoc(userRef, {
                    [`progress.${topicKey}.examUnlockDay`]: unlockDay
                });
                console.log(`🚫 Забіг: тему «${topicKey}» заблоковано до ${unlockDay}`);
            } catch (e) {
                console.error("EXAM_LEVEL_FAILED:", e);
            }
        })();
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
    const closeBtn = document.getElementById("btn-force-close-unity");
    const iframe = document.getElementById("unity-iframe");

    if (unityContainer) unityContainer.classList.add("hidden");
    document.querySelectorAll(".btn-start-game-mode").forEach((b) => {
        b.style.display = "";
    });
    if (closeBtn) closeBtn.remove(); 
    if (iframe) iframe.src = "about:blank"; 
    window.__mathMazeGameMode = "exam";

    window.dispatchEvent(new Event('resize'));
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
    const modeButtons = document.querySelectorAll(".btn-start-game-mode");
    const user = getCurrentUser(); 

    if (user) setupBoostersUI(user); 

    let iframe = document.getElementById("unity-iframe");
    if (!iframe && unityContainer) {
        iframe = document.createElement("iframe");
        iframe.id = "unity-iframe";
        iframe.style.cssText = "width:100%; height:100%; border:none; min-height: 600px;";
        unityContainer.appendChild(iframe);
    }

    if (modeButtons.length && unityContainer) {
        modeButtons.forEach((btn) => {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);

            fresh.onclick = () => {
                const freshUser = getCurrentUser();
                if (!freshUser) return alert("Ви не авторизовані!");

                const mode = fresh.dataset.gameMode === "training" ? "training" : "exam";
                window.__mathMazeGameMode = mode;
                localStorage.setItem("studentUid", freshUser.uid);
            
                unityContainer.classList.remove("hidden");
                document.querySelectorAll(".btn-start-game-mode").forEach((b) => {
                    b.style.display = "none";
                });
                document.querySelector('.sidebar')?.classList.remove('mobile-active');
                window.dispatchEvent(new Event('resize'));
            
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
        });
    }
}

// ==========================================
// 💾 ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТІВ (ВИПРАВЛЕНО)
// ==========================================
async function saveGameResult(resultData, user) {
    try {
        const mode = getLaunchGameMode();
        const score = Number(resultData.score || 0);
        const userRef = doc(db, "users", user.uid); 
        const topic = resultData.topic || "Fractions"; 
        const currentLevel = parseInt(resultData.level || 1);

        // Перевірка бустерів
        const shieldCheckbox = document.querySelector('.booster-checkbox[value="sys_shield"]');
        const isShieldActive = shieldCheckbox ? shieldCheckbox.checked : false;

        const isWin = resultData.win === false ? false : score > 0;

        const cleanedData = {
            ...resultData,
            mistakes: isShieldActive ? 0 : (resultData.mistakes || 0),
            grade: isShieldActive ? 12 : (resultData.grade || 0),
            timestamp: serverTimestamp(),
            win: isWin,
            shieldUsed: isShieldActive,
            gameMode: mode
        };

        // 1. Оновлюємо золото в Firebase
        await updateDoc(userRef, { 
            "profile.gold": increment(score) 
        });

        if (mode === "training") {
            await addDoc(collection(db, "users", user.uid, "game_sessions"), cleanedData);
            console.log(`✅ Тренажер: +${score} золота, прогрес «Забігу» без змін.`);
            return;
        }

        const snapExam = await getDoc(userRef);
        const examData = snapExam.exists() ? snapExam.data() : {};
        const topicKey = resolveTopicKeyForProgress(examData, topic);

        if (!isWin) {
            const unlockDay = nextCalendarDayAfterKyivToday();
            await updateDoc(userRef, {
                [`progress.${topicKey}.examUnlockDay`]: unlockDay
            });
            console.log(`🚫 Забіг: програш — тема «${topicKey}» недоступна в іспиті до ${unlockDay}.`);
        }

        // 2. Режим «Забіг»: розблоковуємо наступний рівень лише якщо це поточний «край» прогресу (не знижуємо max при повторі старого рівня)
        const prevMax = examData.progress?.[topicKey]?.maxAllowedLevel || 1;
        const nextLevel = currentLevel + 1;

        if (isWin && currentLevel >= prevMax) {
            await updateDoc(userRef, {
                [`progress.${topicKey}.maxAllowedLevel`]: nextLevel,
                [`progress.${topicKey}.isBlocked`]: false
            });

            if (!user.progress) user.progress = {};
            if (!user.progress[topicKey]) user.progress[topicKey] = {};
            user.progress[topicKey].maxAllowedLevel = nextLevel;

            const iframe = document.getElementById("unity-iframe");
            if (iframe && iframe.contentWindow) {
                const target = iframe.contentWindow.unityInstance || window.unityGame;
                if (target) {
                    target.SendMessage("MenuController", "UpdateLocalProgress", `${topic}|${currentLevel}`);
                }
            }
            console.log(`✅ Забіг: прогрес ${topicKey} → доступний рівень до ${nextLevel}.`);
        } else if (isWin) {
            console.log(`ℹ️ Забіг: повтор рівня ${currentLevel} (max уже ${prevMax}) — золото нараховано, прогрес не змінюємо.`);
        }

        await addDoc(collection(db, "users", user.uid, "game_sessions"), cleanedData);

    } catch (e) { 
        console.error("❌ Помилка у saveGameResult:", e); 
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

    const loginEl = document.getElementById("student-login-display");
    if (loginEl) {
        // Якщо в об'єкті користувача поле називається username або login
        const username = currentUser.loginID || currentUser.username || currentUser.login || "учень";
        loginEl.textContent = `@${username}`;
    }

    const classEl = document.getElementById("student-class-display");
    if (classEl) {
        // Використовуємо саме className, оскільки так воно названо в базі/auth.js
        classEl.textContent = currentUser.className || "--"; 
    }
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
            user.className = data.className || "--";
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

    localStorage.setItem("studentUid", user.uid);

    startLiveGoldTracker(user.uid);
    if (shopUnsubscribe) shopUnsubscribe();
    
    const teacherRef = doc(db, "users", user.teacherUid);
    const globalShopRef = doc(db, "global_config", "shop");

    // Підписуємось на зміни вчителя
    shopUnsubscribe = onSnapshot(teacherRef, async (docSnap) => {
        let finalItems = null;

        if (docSnap.exists()) {
            const teacherData = docSnap.data();
            
            // 1. Перевірка: чи є у вчителя власний конфіг
            if (teacherData.treasuryConfig && 
                (teacherData.treasuryConfig.micro?.length > 0 || 
                 teacherData.treasuryConfig.medium?.length > 0 || 
                 teacherData.treasuryConfig.large?.length > 0)) {
                
                console.log("🏫 [Shop] Завантажено персональний конфіг вчителя");
                finalItems = teacherData.treasuryConfig;
            } else {
                // 2. Якщо вчитель "порожній" — йдемо в Global Config
                console.log("🌍 [Shop] Конфіг вчителя порожній. Запит до Global Shop...");
                try {
                    const globalSnap = await getDoc(globalShopRef);
                    if (globalSnap.exists()) {
                        finalItems = globalSnap.data();
                        console.log("✅ [Shop] Global Shop завантажено успішно");
                    } else {
                        console.error("❌ [Shop] Global Shop документ не знайдено в БД!");
                    }
                } catch (err) {
                    console.error("❌ [Shop] Помилка запиту до Global Shop:", err);
                }
            }
        }

        // 3. Якщо нічого не знайшли в БД — беремо FALLBACK (аварійний випадок)
        const base = finalItems || FALLBACK_ITEMS;
        if (!finalItems) console.warn("⚠️ [Shop] Використовується локальний FALLBACK_ITEMS");

        cachedShopItems = {
            micro:  base.micro || [],
            medium: base.medium || [],
            large:  base.large || []
        };

        // Рендеримо результат
        renderShopSection("rewards-micro-list", cachedShopItems.micro);
        renderShopSection("rewards-medium-list", cachedShopItems.medium);
        renderShopSection("rewards-large-list", cachedShopItems.large);
        
        renderInventory(user);
    });

    updateHomeDisplay(user);
    renderLeaderboard(user);
    setupAvatarSystem(user);
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

// 1. Допоміжна функція для іконок (додай на початку або перед renderShopSection)
function getBoosterIcon(name) {
    const n = name.toLowerCase();
    if (n.includes("щит")) return "🛡️";
    if (n.includes("час")) return "⏳";
    if (n.includes("радар") || n.includes("підказка")) return "📡";
    return "📜"; // іконка для звичайних нагород
}

// 2. Оновлена функція рендеру секцій магазину
function renderShopSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container || !items) return;
    container.innerHTML = "";

    items.forEach(item => {
        // Визначаємо, чи це системний бустер (по ID)
        const isBooster = item.id && String(item.id).startsWith('sys_');
        const icon = getBoosterIcon(item.name);

        const div = document.createElement("div");
        // Додаємо клас для стилізації, якщо це бустер
        div.className = `shop-item ${isBooster ? 'booster-item-card' : ''}`;
        
        // Додаємо інлайнові стилі для виділення бустерів (якщо немає CSS)
        if (isBooster) {
            div.style.cssText = "background: linear-gradient(145deg, #16212e, #1a1a1a); border: 1px solid #3498db; border-radius: 10px; padding: 15px; margin-bottom: 10px; position: relative; overflow: hidden;";
        } else {
            div.style.cssText = "background: #252525; border: 1px solid #333; border-radius: 10px; padding: 15px; margin-bottom: 10px;";
        }

        div.innerHTML = `
            ${isBooster ? `<div style="position:absolute; top:0; right:0; background:#3498db; color:white; font-size:0.6em; padding:2px 8px; border-bottom-left-radius:8px; font-weight:bold;">БУСТЕР</div>` : ''}
            <div class="shop-item-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div class="item-name" style="font-weight: bold; color: ${isBooster ? '#3498db' : 'white'}; font-size: 1.1em;">
                    ${icon} ${item.name}
                </div>
                <div class="item-price" style="color: #f1c40f; font-weight: bold; font-size: 1.1em;">${item.price} 💰</div>
            </div>
            <div class="item-desc" style="color: #aaa; font-size: 0.85em; margin-bottom: 12px; min-height: 2.5em;">${item.desc || ''}</div>
            <button class="btn-buy" data-id="${item.id}" style="width: 100%; padding: 10px; border: none; border-radius: 6px; background: #2ecc71; color: white; font-weight: bold; cursor: pointer; transition: 0.2s;">
                КУПИТИ
            </button>
        `;

        div.querySelector(".btn-buy").onclick = () => buyItem(item);
        container.appendChild(div);
    });
}

async function buyItem(visualItem) {
    let u = getCurrentUser();
    if (!u) return;

    // ШУКАЄМО ЦІНУ: спочатку в кеші магазину від вчителя
    let realItem = null;
    if (cachedShopItems) {
        // Шукаємо у всіх трьох категоріях
        const allItems = [...(cachedShopItems.micro || []), ...(cachedShopItems.medium || []), ...(cachedShopItems.large || [])];
        realItem = allItems.find(i => i.id === visualItem.id);
    }

    // Якщо вчитель не налаштував ціну, беремо ту, що прийшла візуально (дефолтну)
    if (!realItem) realItem = visualItem; 

    if (u.profile.gold >= realItem.price) {
        if (!confirm(`Купити "${realItem.name}" за ${realItem.price} золота?`)) return;

        u.profile.gold -= realItem.price;
        if (!u.profile.inventory) u.profile.inventory = [];
        
        u.profile.inventory.push({ 
            id: realItem.id, 
            name: realItem.name, 
            date: new Date().toISOString() 
        });

        await saveUserData(u);
        localStorage.setItem("currentUser", JSON.stringify(u));
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
    
    // Якщо порожньо - виводимо повідомлення на всю ширину
    if (userInv.length === 0) {
        listEl.innerHTML = '<div style="width:100%; text-align:center; padding:40px; color:#666; font-style:italic;">Ваш інвентар порожній. Купіть щось у магазині!</div>';
        listEl.style.display = "block";
        return;
    }

    // Підготовка даних магазину
    const shopDB = cachedShopItems || { micro: [], medium: [], large: [] };

    // Допоміжна функція для отримання іконки
    const getItemIcon = (item) => {
        if (item.icon) return item.icon;
        const name = item.name.toLowerCase();
        if (name.includes("щит")) return "🛡️";
        if (name.includes("час")) return "⏳";
        if (name.includes("радар")) return "📡";
        if (name.includes("бал")) return "🏆";
        if (name.includes("дз")) return "📝";
        return "🎁";
    };

    const createColumn = (title, dbItems, color) => {
        const safeItems = dbItems || [];
        
        // Знаходимо, які предмети з цієї категорії магазину є в інвентарі
        // Фільтруємо унікальні предмети, щоб не дублювати картки
        const uniqueItemsInCat = safeItems.filter(shopItem => 
            userInv.some(uItem => uItem.id === shopItem.id || uItem.name === shopItem.name)
        );

        let contentHtml = "";

        if (uniqueItemsInCat.length === 0) {
            contentHtml = `<div style="text-align:center; color:#555; font-size:0.85em; padding:20px; border: 1px dashed #333; border-radius:8px;">Порожньо</div>`;
        } else {
            uniqueItemsInCat.forEach(shopItem => {
                // Рахуємо кількість (по ID або по імені для страховки)
                const count = userInv.filter(uItem => uItem.id === shopItem.id || uItem.name === shopItem.name).length;
                const icon = getItemIcon(shopItem);

                contentHtml += `
                    <div class="inventory-card-item" style="background: rgba(255,255,255,0.03); border-left: 3px solid ${color}; padding: 12px; margin-bottom: 10px; border-radius: 4px; position: relative;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <span style="font-size: 1.2em;">${icon}</span>
                            <div style="flex-grow: 1;">
                                <div style="font-weight: bold; color: #eee; font-size: 0.95em;">${shopItem.name}</div>
                                <div style="font-size: 0.75em; color: #888; line-height: 1.2;">${shopItem.desc || ''}</div>
                            </div>
                            <div style="background: ${color}; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                                ${count}
                            </div>
                        </div>
                    </div>`;
            });
        }

        return `
            <div class="reward-column" style="flex: 1; min-width: 280px; display: flex; flex-direction: column;">
                <div style="color: ${color}; font-weight: bold; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; border-bottom: 1px solid ${color}44; padding-bottom: 5px; display: flex; justify-content: space-between;">
                    <span>${title}</span>
                </div>
                <div class="inventory-column-content">${contentHtml}</div>
            </div>`;
    };

    // Очищуємо та налаштовуємо контейнер
    listEl.innerHTML = "";
    listEl.className = "treasury-grid"; // Використовуємо ваш оригінальний клас
    listEl.style.cssText = "display: flex; gap: 25px; flex-wrap: wrap; justify-content: center; width: 100%; padding: 10px;";

    // Рендеримо 3 колонки з різними кольорами
    listEl.innerHTML += createColumn("Мікро-нагороди", shopDB.micro, "#2ecc71");
    listEl.innerHTML += createColumn("Середні нагороди", shopDB.medium, "#3498db");
    listEl.innerHTML += createColumn("Великі нагороди", shopDB.large, "#9b59b6");
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