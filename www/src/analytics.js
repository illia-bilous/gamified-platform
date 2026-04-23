import { db } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from "./auth.js";

let cachedStudents = [];
const ANALYTICS_MODES = {
    all: "Усі спроби",
    training: "Тренування",
    exam: "Забіг"
};

function normalizeClass(str) {
    if (!str) return "БЕЗ КЛАСУ";
    return str.toString().trim().replace(/A/g, "А").replace(/B/g, "В").replace(/C/g, "С").replace(/I/g, "І").toUpperCase();
}

// Допоміжна функція часу
function formatTime(seconds) {
    if (!seconds) return "0хв 0с";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}хв ${s}с`;
}

function normalizeGameMode(mode) {
    return String(mode || "").toLowerCase().trim() === "training" ? "training" : "exam";
}

function gradeColor(grade) {
    if (grade >= 10) return "#2ecc71";
    if (grade >= 7) return "#f1c40f";
    return "#e74c3c";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatSessionDate(ts) {
    if (!ts) return "-";
    if (ts?.toDate) return ts.toDate().toLocaleString("uk-UA");
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleString("uk-UA");
    return "-";
}

function formatMistakesDisplay(session) {
    if (session?.tabSwitchForfeit) return "Намагався списати";

    // Підтримка старих записів до додавання tabSwitchForfeit:
    // античит історично зберігався як grade=2, score=0, mistakes=99.
    const mistakes = Number(session?.mistakes ?? 0);
    const grade = Number(session?.grade ?? 0);
    const score = Number(session?.score ?? 0);
    if (mistakes >= 99 && grade <= 2 && score <= 0) return "Намагався списати";

    return String(session?.mistakes ?? 0);
}

export async function loadTeacherAnalytics() {
    console.log("--- ЗАПУСК АНАЛІТИКИ ---");

    const selectElement = document.getElementById("class-filter-select");
    const tbody = document.getElementById("analytics-tbody");
    
    if (!selectElement || !tbody) return console.error("Елементи HTML не знайдено.");

    selectElement.innerHTML = '<option>🔄 Завантаження...</option>';
    tbody.innerHTML = '';

    const teacher = getCurrentUser();
    if (!teacher || !teacher.uid) {
        selectElement.innerHTML = '<option>Помилка доступу</option>';
        return;
    }

    try {
        const usersRef = collection(db, "users");
        // Шукаємо учнів цього вчителя
        const q = query(usersRef, where("role", "==", "student"), where("teacherUid", "==", teacher.uid));
        
        const snapshot = await getDocs(q);
        console.log(`📊 Знайдено учнів у базі: ${snapshot.size}`);

        cachedStudents = [];
        const classesSet = new Set(); 

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // 🔥 ВАЖЛИВА ЗМІНА:
            // Якщо в документі є поле 'uid' (справжній Auth ID), беремо його. 
            // Якщо ні — беремо ID самого документа.
            data.targetUid = data.uid || docSnap.id; 
            
            // Зберігаємо оригінальний ID документа для відладки
            data.docId = docSnap.id;

            const rawClass = data.className || data.class || "Без класу";
            data._cleanClass = normalizeClass(rawClass);
            data._displayClass = rawClass;

            cachedStudents.push(data);
            classesSet.add(data._cleanClass);
        });

        // Сортування класів
        const sortedClasses = Array.from(classesSet).sort();
        if (sortedClasses.length === 0) {
            selectElement.innerHTML = '<option>Учнів не знайдено</option>';
            return;
        }

        let optionsHtml = `<option value="" disabled selected>-- Оберіть клас --</option>`;
        sortedClasses.forEach(className => optionsHtml += `<option value="${className}">${className}</option>`);
        selectElement.innerHTML = optionsHtml;

        selectElement.onchange = (e) => renderTable(e.target.value);

    } catch (error) {
        console.error("Помилка завантаження:", error);
        selectElement.innerHTML = '<option>Помилка (див. консоль)</option>';
    }
}

function renderTable(selectedCleanClass) {
    const tbody = document.getElementById("analytics-tbody");
    tbody.innerHTML = "";

    const analyticsTable = tbody.closest("table");
    if (analyticsTable) {
        analyticsTable.style.width = "100%";
        analyticsTable.style.minWidth = "1320px";
        analyticsTable.style.tableLayout = "auto";
    }
    const tableWrapper = analyticsTable?.parentElement;
    if (tableWrapper) {
        tableWrapper.style.width = "98%";
        tableWrapper.style.maxWidth = "1360px";
        tableWrapper.style.margin = "0 auto";
        tableWrapper.style.overflowX = "auto";
    }

    const filteredStudents = cachedStudents.filter(s => s._cleanClass === selectedCleanClass);

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Пусто.</td></tr>`;
        return;
    }

    filteredStudents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    filteredStudents.forEach(user => {
        let totalGold = user.profile?.gold ?? user.gold ?? 0;
        const avatarSrc = (user.profile?.avatar || 'assets/img/base.png').replace('assets/avatars/', 'assets/img/');

        // Передаємо targetUid у функцію
        const row = `
            <tr class="student-main-row">
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                        <b>${user.name}</b>
                    </div>
                </td>
                <td>${user._displayClass}</td>
                <td><span class="highlight-code">${user.loginID || "—"}</span></td>
                <td style="color: #f1c40f;">${totalGold} 💰</td>
                <td style="text-align: center;">
                    <button class="btn-action btn-journal-open" onclick="toggleJournal('${user.targetUid}')">
                        📖 Журнал
                    </button>
                </td>
            </tr>
            <tr id="details-${user.targetUid}" class="details-row" style="display: none;">
                <td colspan="5" style="background: rgba(0,0,0,0.2); padding: 0;">
                    <div id="history-container-${user.targetUid}" style="padding: 20px; width: 100%; max-width: 1320px; margin: 0 auto;"></div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Глобальна функція (щоб HTML її бачив)
window.toggleJournal = async function(targetUid) {
    console.log(`🔎 Відкриваємо журнал для ID: ${targetUid}`);
    
    const detailsRow = document.getElementById(`details-${targetUid}`);
    if (!detailsRow) return console.error(`Елемент details-${targetUid} не знайдено`);

    const isOpening = (detailsRow.style.display === "none");
    document.querySelectorAll('.details-row').forEach(r => r.style.display = 'none');

    if (isOpening) {
        detailsRow.style.display = "table-row";
        const container = document.getElementById(`history-container-${targetUid}`);
        container.innerHTML = '<p style="text-align:center; color:#aaa;">Завантаження історії... ⏳</p>';
        
        try {
            // Спроба 1: З сортуванням (якщо індекс є)
            // ПРИМІТКА: Якщо це не працює, спробуйте прибрати orderBy
            const historyRef = collection(db, "users", targetUid, "game_sessions");
            const q = query(historyRef, orderBy("timestamp", "desc"));
            
            console.log(`📡 Запит до: users/${targetUid}/game_sessions`);
            
            const snapshot = await getDocs(q);
            console.log(`📄 Знайдено записів: ${snapshot.size}`);

            if (snapshot.empty) {
                // ДОДАТКОВА ПЕРЕВІРКА: Може ID не той?
                container.innerHTML = `<p style='text-align:center; color:#aaa;'>
                    Історія порожня.<br>
                    <span style="font-size:0.8em; color:#666;">ID учня: ${targetUid}</span>
                </p>`;
                return;
            }

            const sessions = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            let activeMode = "all";
            let selectedSessionId = null;

            const render = () => {
                const filtered = activeMode === "all"
                    ? sessions
                    : sessions.filter((s) => normalizeGameMode(s.gameMode) === activeMode);

                if (selectedSessionId && !filtered.some((s) => s.id === selectedSessionId)) {
                    selectedSessionId = null;
                }

                const modeButtonsHtml = Object.entries(ANALYTICS_MODES).map(([modeKey, modeLabel]) => {
                    const isActive = modeKey === activeMode;
                    return `
                        <button class="analytics-mode-btn"
                                data-mode="${modeKey}"
                                style="padding:6px 12px; border-radius:8px; border:1px solid ${isActive ? "#1abc9c" : "#555"}; background:${isActive ? "rgba(26,188,156,0.2)" : "#2a2a2a"}; color:${isActive ? "#d7fff7" : "#ddd"}; cursor:pointer; font-weight:700;">
                            ${modeLabel}
                        </button>
                    `;
                }).join("");

                if (filtered.length === 0) {
                    container.innerHTML = `
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">${modeButtonsHtml}</div>
                        <p style="color:#aaa; text-align:center; padding:14px;">Немає записів для "${ANALYTICS_MODES[activeMode]}".</p>
                    `;
                    bindModeButtons();
                    return;
                }

                const chartData = [...filtered].reverse();
                const width = 1180;
                const height = 360;
                const pad = 34;
                const innerW = width - pad * 2;
                const innerH = height - pad * 2;
                const minGrade = 0;
                const maxGrade = 12;
                const stepX = chartData.length > 1 ? innerW / (chartData.length - 1) : 0;

                const path = chartData.map((session, idx) => {
                    const g = Math.max(minGrade, Math.min(maxGrade, Number(session.grade || 0)));
                    const x = pad + idx * stepX;
                    const y = pad + innerH - ((g - minGrade) / (maxGrade - minGrade)) * innerH;
                    return `${idx === 0 ? "M" : "L"}${x},${y}`;
                }).join(" ");

                const circles = chartData.map((session, idx) => {
                    const g = Math.max(minGrade, Math.min(maxGrade, Number(session.grade || 0)));
                    const x = pad + idx * stepX;
                    const y = pad + innerH - ((g - minGrade) / (maxGrade - minGrade)) * innerH;
                    const c = gradeColor(g);
                    const isSelected = selectedSessionId === session.id;
                    return `
                        <circle data-session-id="${session.id}" cx="${x}" cy="${y}" r="${isSelected ? 7 : 5}"
                                fill="${c}" stroke="${isSelected ? "#fff" : "#0f1720"}"
                                stroke-width="${isSelected ? 2.5 : 1.2}" style="cursor:pointer;" />
                    `;
                }).join("");

                const selected = selectedSessionId
                    ? chartData.find((s) => s.id === selectedSessionId)
                    : null;

                const tableRows = filtered.map((s) => {
                    const rowMode = normalizeGameMode(s.gameMode);
                    const rowGrade = Number(s.grade || 0);
                    const mistakesLabel = formatMistakesDisplay(s);
                    return `
                        <tr style="border-bottom:1px solid #3b3b3b;">
                            <td style="padding:8px; color:#b9c2cc;">${escapeHtml(formatSessionDate(s.timestamp))}</td>
                            <td style="padding:8px; color:#e7edf4;">${escapeHtml(s.topic || "-")}</td>
                            <td style="padding:8px; text-align:center; color:#d9e5f2;">${s.level || 1}</td>
                            <td style="padding:8px; text-align:center; color:${gradeColor(rowGrade)}; font-weight:700;">${rowGrade}</td>
                            <td style="padding:8px; text-align:center; color:#f1c40f;">+${s.score || 0}</td>
                            <td style="padding:8px; text-align:center; color:#ff8f8f;">${escapeHtml(mistakesLabel)}</td>
                            <td style="padding:8px; text-align:center; color:#9fd1ff;">${formatTime(Number(s.timeSpent || 0))}</td>
                            <td style="padding:8px; text-align:center; color:#9adcb7;">${ANALYTICS_MODES[rowMode]}</td>
                        </tr>
                    `;
                }).join("");

                container.innerHTML = `
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">${modeButtonsHtml}</div>
                    <div style="margin-bottom:8px; color:#9aa3ad; font-size:0.85em;">
                        Показано: <b style="color:#d9fef5;">${ANALYTICS_MODES[activeMode]}</b> • Записів: <b>${chartData.length}</b>
                    </div>
                    <div style="overflow-x:auto; border:1px solid #343a40; border-radius:10px; background:#11181f; padding:10px;">
                        <svg viewBox="0 0 ${width} ${height}" width="100%" height="360" preserveAspectRatio="xMidYMid meet">
                            <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#566070" />
                            <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#566070" />
                            <line x1="${pad}" y1="${pad + innerH / 2}" x2="${width - pad}" y2="${pad + innerH / 2}" stroke="#2f3a4b" stroke-dasharray="4 4" />
                            <text x="8" y="${pad + 4}" fill="#8f9bad" font-size="11">12</text>
                            <text x="12" y="${pad + innerH / 2 + 4}" fill="#8f9bad" font-size="11">6</text>
                            <text x="12" y="${height - pad + 4}" fill="#8f9bad" font-size="11">0</text>
                            <path d="${path}" fill="none" stroke="#3b82f6" stroke-opacity="0.45" stroke-width="2" />
                            ${circles}
                        </svg>
                    </div>
                    <div style="margin-top:12px; background:rgba(255,255,255,0.03); border:1px solid #3a3a3a; border-radius:10px; padding:12px;">
                        ${selected ? `
                            <div style="font-weight:700; color:#fff; margin-bottom:8px;">Деталі спроби</div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; color:#d0d0d0; font-size:0.92em;">
                                <div>📅 ${escapeHtml(formatSessionDate(selected.timestamp))}</div>
                                <div>🏷️ Режим: <b>${ANALYTICS_MODES[normalizeGameMode(selected.gameMode)]}</b></div>
                                <div>🧩 Тема: <b>${escapeHtml(selected.topic || "-")}</b></div>
                                <div>🎚️ Рівень: <b>${selected.level || 1}</b></div>
                                <div>📝 Оцінка: <b style="color:${gradeColor(Number(selected.grade || 0))}">${selected.grade || 0}</b></div>
                                <div>💰 Золото: <b style="color:#f1c40f;">+${selected.score || 0}</b></div>
                                <div>⏱️ Час: <b>${formatTime(Number(selected.timeSpent || 0))}</b></div>
                                <div>❌ Помилки: <b>${escapeHtml(formatMistakesDisplay(selected))}</b></div>
                            </div>
                        ` : `
                            <div style="color:#8d99a8; text-align:center;">Натисніть на точку графіка, щоб побачити деталі спроби.</div>
                        `}
                    </div>
                    <div style="margin-top:12px;">
                        <div style="color:#c9d4df; font-weight:700; margin-bottom:8px;">Усі оцінки (${ANALYTICS_MODES[activeMode]})</div>
                        <div style="overflow-x:auto; border:1px solid #3a3a3a; border-radius:10px; background:#151515;">
                            <table style="width:100%; border-collapse:collapse; font-size:0.88em; min-width:860px;">
                                <thead>
                                    <tr style="background:#262626; color:#f1c40f; text-align:left;">
                                        <th style="padding:9px;">Дата</th>
                                        <th style="padding:9px;">Тема</th>
                                        <th style="padding:9px; text-align:center;">Рівень</th>
                                        <th style="padding:9px; text-align:center;">Оцінка</th>
                                        <th style="padding:9px; text-align:center;">Золото</th>
                                        <th style="padding:9px; text-align:center;">Помилки</th>
                                        <th style="padding:9px; text-align:center;">Час</th>
                                        <th style="padding:9px; text-align:center;">Режим</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                bindModeButtons();
                container.querySelectorAll("circle[data-session-id]").forEach((dot) => {
                    dot.addEventListener("click", () => {
                        selectedSessionId = dot.getAttribute("data-session-id");
                        render();
                    });
                });
            };

            const bindModeButtons = () => {
                container.querySelectorAll(".analytics-mode-btn").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        activeMode = btn.getAttribute("data-mode");
                        selectedSessionId = null;
                        render();
                    });
                });
            };

            render();

        } catch(e) {
            console.error("❌ Помилка завантаження журналу:", e);
            
            // Якщо помилка про індекс - показуємо це
            if (e.message.includes("index")) {
                container.innerHTML = "<p style='color:orange'>Потрібно створити індекс у Firebase Console (див. консоль).</p>";
            } else {
                container.innerHTML = "<p style='color:red'>Помилка завантаження. Див. консоль.</p>";
            }
        }
    }
};