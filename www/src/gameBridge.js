import { db } from "./firebase.js";
import { doc, getDoc, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateTrainingTask, normalizeTopicKey } from "./mathTrainingGenerator.js";

let cachedPayload = null;

/** Київська календарна дата YYYY-MM-DD */
export function getKyivYMD() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

/** Наступна календарна дата після поточного дня за Києвом (YYYY-MM-DD) */
export function nextCalendarDayAfterKyivToday() {
    const ymd = getKyivYMD();
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const y2 = dt.getUTCFullYear();
    const m2 = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d2 = String(dt.getUTCDate()).padStart(2, "0");
    return `${y2}-${m2}-${d2}`;
}

/** Ключ progress.* у Firestore: збіг за сирим ім'ям з Unity або за канонічним (Quadratics тощо) */
function progressTopicKey(userData, topicRaw) {
    const progress = userData?.progress || {};
    const keys = Object.keys(progress);
    const raw = String(topicRaw || "").trim();
    const canon = normalizeTopicKey(topicRaw);
    const byRaw = keys.find((k) => k.toLowerCase() === raw.toLowerCase());
    if (byRaw) return byRaw;
    const byCanon = keys.find((k) => k.toLowerCase() === canon.toLowerCase());
    if (byCanon) return byCanon;
    return canon;
}

/** Чи тема в «Забігу» ще під добовим локом після програшу */
export function isExamTopicLockedByDate(userData, topic) {
    if (!userData?.progress) return false;
    const key = progressTopicKey(userData, topic);
    const unlock = userData.progress[key]?.examUnlockDay;
    if (!unlock || typeof unlock !== "string") return false;
    return getKyivYMD() < unlock;
}

/** Режим з батьківської сторінки: "training" | "exam" */
function getLaunchGameMode() {
    const m = String(window.__mathMazeGameMode || "").toLowerCase().trim();
    return m === "training" ? "training" : "exam";
}

const TRAINING_TIME_MULT = 1.65;
const TRAINING_REWARD_MULT = 0.35;
const EXAM_TIME_MULT = 0.82;
const EXAM_REWARD_MULT = 1.55;

/**
 * Повернення в Unity → Menu_Levels при добовому локі теми.
 * Синхронний alert блокує WebGL — SendMessage часто не виконується до закриття діалогу.
 * Тому: кілька спроб + postMessage у вікно iframe (див. www/unity/index.html).
 */
function requestUnityReturnToLevelMenu() {
    const iframe = document.getElementById("unity-iframe");
    if (!iframe?.contentWindow) return;
    const cw = iframe.contentWindow;
    const kick = () => {
        try {
            cw.postMessage({ type: "MATHMAZE_FORCE_LEVEL_MENU" }, "*");
        } catch (e) {}
        const u = cw.unityInstance;
        if (u && typeof u.SendMessage === "function") {
            try {
                u.SendMessage("GameManager", "ReturnToLevelMenuFromWebLock", "");
            } catch (e) {}
        }
    };
    kick();
    [50, 120, 250, 500, 1000, 1800].forEach((ms) => setTimeout(kick, ms));
}

// Допоміжна функція для пошуку теми без урахування регістру (Fractions == fractions)
function findTopicCaseInsensitive(data, topic) {
    if (!data) return null;
    
    // 1. Шукаємо в корені
    let topicKey = Object.keys(data).find(k => k.toLowerCase() === topic.toLowerCase());
    
    // 2. Якщо не знайшли, шукаємо в під-об'єкті 'topics' (для сумісності старих структур)
    if (!topicKey && data.topics) {
        const subKeys = Object.keys(data.topics);
        const subKey = subKeys.find(k => k.toLowerCase() === topic.toLowerCase());
        if (subKey) return data.topics[subKey];
    }

    if (topicKey) return data[topicKey];
    return null;
}

// Допоміжна функція для витягування конкретного рівня з даних теми
function getLevelFromTopicData(topicData, level) {
    if (!topicData) return null;

    // Варіант А: Масив "doors" (як у вашій новій структурі)
    if (topicData.doors && Array.isArray(topicData.doors)) {
        return topicData.doors[level - 1]; 
    }
    
    // Варіант Б: Об'єкт "1", "2" (стара структура)
    if (typeof topicData === 'object') {
        return topicData[level] || topicData[String(level)];
    }
    
    return null;
}

export async function sendConfigToUnity(topic, teacherId, studentId, level = 1, mode = null) {
    const gameMode =
        mode === "training" ? "training" : mode === "exam" ? "exam" : getLaunchGameMode();
    console.log(`🚀 GameBridge: Старт... Topic="${topic}", Teacher="${teacherId}", Level=${level}, mode=${gameMode}`);

    // --- ПЕРЕВІРКА ПРОГРЕСУ (лише режим «Забіг») — у тренажері всі 4 рівні доступні з боку конфігу ---
    if (gameMode !== "training" && studentId) {
        try {
            const userRef = doc(db, "users", studentId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const pKey = progressTopicKey(userData, topic);
                const maxAllowed = userData.progress?.[pKey]?.maxAllowedLevel || 1;
                
                if (level > maxAllowed) {
                    console.error(`🚫 Спроба доступу до заблокованого рівня! Запитувано: ${level}, Дозволено: ${maxAllowed}`);
                    // Можна примусово скинути на доступний рівень
                    level = maxAllowed; 
                }
            }
        } catch (e) {
            console.error("❌ Помилка перевірки ліміту рівня:", e);
        }
    }

    const iframe = document.getElementById("unity-iframe");
    if (!iframe) {
        console.warn("⚠️ GameBridge: Unity Iframe не знайдено.");
        return;
    }

    if (gameMode !== "training" && studentId) {
        try {
            const userRef = doc(db, "users", studentId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && isExamTopicLockedByDate(userSnap.data(), topic)) {
                console.warn(`🚫 Забіг: тема «${topic}» тимчасово заблокована після програшу.`);
                requestUnityReturnToLevelMenu();
                setTimeout(() => {
                    alert(
                        `Тема ${topic} заблокована, потренуйтесь в тренажері, або пройдіть іншу тему`
                    );
                }, 400);
                return;
            }
        } catch (e) {
            console.error("exam lock check:", e);
        }
    }

    let finalConfig = {
        question: `Рівень ${level}: 2 + 2 = ?`, 
        answer: "4",
        wrongAnswers: ["5", "3", "1"],
        time: 120,
        reward: 10,
        hasShield: false,
        hasRadar: false,
        hasExtraTime: false,
        gameMode
    };

    // ==========================================
    // 🛡️ ЛОГІКА БУСТЕРІВ (СПИСАННЯ З МАСИВУ)
    // ==========================================
    const selectedBoosterIds = Array.from(document.querySelectorAll('.booster-checkbox:checked'))
                                    .map(cb => cb.value);
    
    if (selectedBoosterIds.length > 0 && studentId) {
        try {
            const studentRef = doc(db, "users", studentId);
            const studentSnap = await getDoc(studentRef);

            if (studentSnap.exists()) {
                const studentData = studentSnap.data();
                // У вас інвентар лежить в profile.inventory
                const inventory = studentData.profile?.inventory || [];
                const toRemove = [];

                selectedBoosterIds.forEach(id => {
                    // Знаходимо ПОВНИЙ об'єкт у масиві, бо arrayRemove видаляє лише при повному збігу
                    const itemObject = inventory.find(i => i.id === id);
                    
                    if (itemObject) {
                        toRemove.push(itemObject);
                        
                        // Вмикаємо прапорці для Unity
                        if (id === 'sys_shield') finalConfig.hasShield = true;
                        if (id === 'sys_radar') finalConfig.hasRadar = true;
                        if (id === 'sys_time') finalConfig.hasExtraTime = true;
                    }
                });

                if (toRemove.length > 0) {
                    await updateDoc(studentRef, {
                        "profile.inventory": arrayRemove(...toRemove)
                    });
                    console.log("💎 Бустери списано з бази:", toRemove.map(i => i.id));
                }
            }
        } catch (e) {
            console.error("❌ Помилка списання бустерів:", e);
            // Зупиняємо запуск, якщо не вдалося списати (захист від накрутки)
            return; 
        }
    }
    // ==========================================

    let foundTask = null;
    try {
        if (gameMode === "training") {
            foundTask = generateTrainingTask(normalizeTopicKey(topic), level);
        } else {
            // Забіг: конфіг за ключами Fractions / Powers / Quadratics (Unity може слати «Рівняння»)
            const topicForConfig = normalizeTopicKey(topic);
            if (teacherId) {
                const teacherRef = doc(db, "teacher_configs", teacherId);
                const teacherSnap = await getDoc(teacherRef);
                if (teacherSnap.exists()) {
                    let topicData = findTopicCaseInsensitive(teacherSnap.data(), topic);
                    if (!topicData) topicData = findTopicCaseInsensitive(teacherSnap.data(), topicForConfig);
                    if (topicData) {
                        foundTask = getLevelFromTopicData(topicData, level);
                    }
                }
            }

            if (!foundTask) {
                const globalRef = doc(db, "global_config", "game_levels");
                const globalSnap = await getDoc(globalRef);
                if (globalSnap.exists()) {
                    let topicData = findTopicCaseInsensitive(globalSnap.data(), topic);
                    if (!topicData) topicData = findTopicCaseInsensitive(globalSnap.data(), topicForConfig);
                    if (topicData) {
                        foundTask = getLevelFromTopicData(topicData, level);
                    }
                }
            }
        }

        if (foundTask) {
            finalConfig.question = foundTask.question || "Питання?";
            finalConfig.answer = String(foundTask.answer || "0");
            if (Array.isArray(foundTask.wrongAnswers)) {
                finalConfig.wrongAnswers = foundTask.wrongAnswers.map(String);
            }
            if (typeof foundTask.explanation === "string") {
                finalConfig.explanation = foundTask.explanation;
            }

            finalConfig.time = foundTask.timeLimit ? parseInt(foundTask.timeLimit, 10) : 120;

            if (foundTask.reward !== undefined) finalConfig.reward = parseInt(foundTask.reward, 10);
        }
    } catch (err) {
        console.error(err);
    }

    if (gameMode === "training") {
        finalConfig.time = Math.max(45, Math.ceil(finalConfig.time * TRAINING_TIME_MULT));
        finalConfig.reward = Math.max(1, Math.floor(finalConfig.reward * TRAINING_REWARD_MULT));
    } else {
        finalConfig.time = Math.max(25, Math.floor(finalConfig.time * EXAM_TIME_MULT));
        finalConfig.reward = Math.max(1, Math.ceil(finalConfig.reward * EXAM_REWARD_MULT));
    }
    finalConfig.gameMode = gameMode;

    // --- 4. ВІДПРАВКА ---
    // Передаємо gameMode в Unity, щоб прогрес "пройдено тему" рахувався тільки для режиму "Забіг".
    const payload = JSON.stringify(finalConfig);
    cachedPayload = payload;
    const unityGame = iframe.contentWindow.unityInstance;

    if (unityGame) {
        console.log("✅ Відправка до GameManager:", finalConfig, `(mode=${gameMode})`);
        unityGame.SendMessage("GameManager", "AcceptConfig", payload);
        window.__unityPlayContext = {
            topic,
            level,
            mode: gameMode,
            at: Date.now()
        };
    }
}

// Для повторної відправки
window.trySendToUnity = function() { 
    if (!cachedPayload) return;
    const iframe = document.getElementById("unity-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(cachedPayload, "*");
    }
};

window.addEventListener("message", async (event) => {
    const data = event.data;

    // --- НОВИЙ БЛОК: ОБРОБКА ПЕРЕМОГИ ---
    if (typeof data === "string" && data.startsWith("LEVEL_COMPLETE|")) {
        try {
            const jsonPart = data.split("|")[1];
            const result = JSON.parse(jsonPart);
            const { topic, level, win } = result;
            const studentId = localStorage.getItem("studentUid");

            if (getLaunchGameMode() === "training") {
                return;
            }

            if (win && studentId) {
                console.log(`🏆 Рівень ${level} пройдено у темі ${topic}. Оновлюємо базу...`);
                
                const userRef = doc(db, "users", studentId);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const pKey = progressTopicKey(userData, topic);
                    const currentMax = userData.progress?.[pKey]?.maxAllowedLevel || 1;

                    // Оновлюємо, тільки якщо пройдений рівень дорівнює поточному максимуму
                    if (level >= currentMax) {
                        const nextLevel = level + 1;
                        await updateDoc(userRef, {
                            [`progress.${pKey}.maxAllowedLevel`]: nextLevel
                        });
                        console.log(`✅ Firebase оновлено! Наступний доступний рівень: ${nextLevel}`);
                    }
                }
            }
        } catch (e) {
            console.error("❌ Помилка при розборі LEVEL_COMPLETE:", e);
        }
        return; // Виходимо, бо це повідомлення ми вже обробили
    }
    // ------------------------------------
    // REQUEST_TEACHER_LIMIT обробляє лише studentPanel.js (один слухач — без гонки SetTeacherLimit).
});