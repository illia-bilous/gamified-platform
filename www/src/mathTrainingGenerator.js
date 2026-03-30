/**
 * Випадкові завдання для тренажера (не з конфігу вчителя).
 * level: 1 — найлегше, 4 — найскладніше.
 */

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function makeWrongNumeric(correct, count = 3) {
    const set = new Set();
    const n = Number(correct);
    let guard = 0;
    while (set.size < count && guard++ < 50) {
        const delta = randInt(-12, 12);
        if (delta === 0) continue;
        const w = n + delta;
        if (w === n) continue;
        set.add(String(w));
    }
    while (set.size < count) {
        set.add(String(n + set.size + 1));
    }
    return shuffle([...set]);
}

function pickPowerTaskWithinLimit(buildTask, maxAbsAnswer = 9999, tries = 40) {
    for (let i = 0; i < tries; i++) {
        const task = buildTask();
        const ans = Number(task.answer);
        if (Number.isFinite(ans) && Math.abs(ans) <= maxAbsAnswer) return task;
    }
    return buildTask();
}

function formatFraction(n, d) {
    return `${n}/${d}`;
}

/**
 * Ключ теми як у Firestore / редактора вчителя: Fractions | Powers | Quadratics.
 * Unity часто шле українські назви («Рівняння») — їх треба звести до Quadratics.
 */
export function normalizeTopicKey(topic) {
    if (!topic) return "Fractions";
    const t = String(topic).trim();
    const lower = t.toLowerCase();

    if (lower === "fractions" || lower.includes("fraction") || lower.includes("дроб")) return "Fractions";
    if (lower === "powers" || lower.includes("power") || lower.includes("степен")) return "Powers";
    if (
        lower === "quadratics" ||
        lower.includes("quadrat") ||
        lower.includes("квадрат") ||
        lower.includes("рівнян") ||
        lower.includes("equation")
    ) {
        return "Quadratics";
    }

    return t.charAt(0).toUpperCase() + t.slice(1);
}

function genFractions(level) {
    let question;
    let answer;
    let explanation;
    if (level <= 1) {
        const b = randInt(2, 8);
        const a = randInt(1, b - 1);
        question = `Спрости дріб: ${a}/${b}`;
        const g = gcd(a, b);
        answer = String(a / g) + "/" + String(b / g);
        explanation = `Знайди НСД(${a}, ${b}) = ${g}. Поділи чисельник і знаменник: ${a}/${b} = ${a / g}/${b / g}.`;
    } else if (level === 2) {
        const d1 = randInt(2, 6);
        const d2 = randInt(2, 6);
        const n1 = randInt(1, d1 - 1);
        const n2 = randInt(1, d2 - 1);
        question = `Обчисли: ${n1}/${d1} + ${n2}/${d2}`;
        const num = n1 * d2 + n2 * d1;
        const den = d1 * d2;
        const g = gcd(num, den);
        answer = String(num / g) + "/" + String(den / g);
        explanation =
            `До спільного знаменника ${den}: ${formatFraction(n1, d1)} = ${n1 * d2}/${den}, ` +
            `${formatFraction(n2, d2)} = ${n2 * d1}/${den}. ` +
            `Сума = ${num}/${den} = ${num / g}/${den / g}.`;
    } else if (level === 3) {
        const d1 = randInt(3, 9);
        const d2 = randInt(3, 9);
        const n1 = randInt(1, d1 - 1);
        const n2 = randInt(1, d2 - 1);
        question = `Обчисли: ${n1}/${d1} − ${n2}/${d2}`;
        let num = n1 * d2 - n2 * d1;
        let den = d1 * d2;
        if (num <= 0) {
            return genFractions(level);
        }
        const g = gcd(num, den);
        answer = String(num / g) + "/" + String(den / g);
        explanation =
            `До спільного знаменника ${den}: ${formatFraction(n1, d1)} = ${n1 * d2}/${den}, ` +
            `${formatFraction(n2, d2)} = ${n2 * d1}/${den}. ` +
            `Різниця = ${num}/${den} = ${num / g}/${den / g}.`;
    } else {
        const a = randInt(2, 7);
        const b = randInt(2, 7);
        const c = randInt(2, 7);
        const d = randInt(2, 7);
        question = `Обчисли: ${a}/${b} × ${c}/${d}`;
        const num = a * c;
        const den = b * d;
        const g = gcd(num, den);
        answer = String(num / g) + "/" + String(den / g);
        explanation =
            `При множенні дробів множимо чисельники і знаменники: ` +
            `${a}*${c}/${b}*${d} = ${num}/${den} = ${num / g}/${den / g}.`;
    }
    return { question, answer, wrongAnswers: makeWrongAnswersFraction(answer), explanation };
}

function gcd(x, y) {
    let a = Math.abs(x);
    let b = Math.abs(y);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a || 1;
}

function makeWrongAnswersFraction(answer) {
    const parts = answer.split("/");
    if (parts.length !== 2) return makeWrongNumeric(answer);
    const n = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    const wrong = new Set();
    let guard = 0;
    while (wrong.size < 3 && guard++ < 60) {
        const nn = Math.max(1, n + randInt(-2, 2));
        const dd = Math.max(2, d + randInt(-2, 2));
        const g = gcd(nn, dd);
        const s = `${nn / g}/${dd / g}`;
        if (s !== answer) wrong.add(s);
    }
    while (wrong.size < 3) wrong.add(`${n + wrong.size + 1}/${d}`);
    return shuffle([...wrong]);
}

function genPowers(level) {
    if (level <= 1) {
        const a = randInt(2, 12);
        const answer = String(a * a);
        return {
            question: `Обчисли: ${a}^2`,
            answer,
            wrongAnswers: makeWrongNumeric(answer),
            explanation: `${a}^2 = ${a} * ${a} = ${answer}.`
        };
    } else if (level === 2) {
        const a = randInt(2, 9);
        const answer = String(a ** 3);
        return {
            question: `Обчисли: ${a}^3`,
            answer,
            wrongAnswers: makeWrongNumeric(answer),
            explanation: `${a}^3 = ${a} * ${a} * ${a} = ${answer}.`
        };
    } else if (level === 3) {
        return pickPowerTaskWithinLimit(() => {
            const a = randInt(2, 8);
            const m = randInt(2, 3);
            const n = 2;
            const pow = m * n;
            const answer = String(a ** pow);
            return {
                question: `Обчисли: (${a}^${m})^${n}`,
                answer,
                wrongAnswers: makeWrongNumeric(answer),
                explanation: `Степінь степеня: (a^m)^n = a^(m*n). Тобто (${a}^${m})^${n} = ${a}^${pow} = ${answer}.`
            };
        });
    } else {
        return pickPowerTaskWithinLimit(() => {
            const a = randInt(2, 7);
            const m = randInt(2, 3);
            const n = randInt(2, 3);
            const pow = m + n;
            const answer = String(a ** pow);
            return {
                question: `Обчисли: ${a}^${m} · ${a}^${n}`,
                answer,
                wrongAnswers: makeWrongNumeric(answer),
                explanation: `Однакова основа: a^m * a^n = a^(m+n). Тобто ${a}^${m} * ${a}^${n} = ${a}^${pow} = ${answer}.`
            };
        });
    }
}

function fmtQuadSign(val, varPart) {
    if (val === 0) return "";
    const abs = Math.abs(val);
    const sign = val < 0 ? " − " : " + ";
    return `${sign}${abs === 1 && varPart === "x" ? "" : abs}${varPart}`;
}

function genQuadratics(level) {
    let question;
    let answer;
    let explanation;
    if (level <= 1) {
        const x = randInt(-7, 7);
        const lhs = x >= 0 ? `(x − ${x})²` : `(x + ${-x})²`;
        question = `Розв'яж: ${lhs} = 0`;
        answer = String(x);
        explanation = `Квадрат дорівнює нулю, коли вираз у дужках 0. Отже x = ${x}.`;
    } else if (level === 2) {
        const r1 = randInt(-5, 5);
        let r2 = randInt(-5, 5);
        if (r1 === r2) r2 = r1 + randInt(1, 3);
        const b = -(r1 + r2);
        const c = r1 * r2;
        const mid = fmtQuadSign(b, "x");
        const last = c === 0 ? "" : fmtQuadSign(c, "");
        question = `Добуток коренів рівняння x²${mid}${last} = 0`;
        answer = String(r1 * r2);
        explanation = `За теоремою Вієта для x² + bx + c = 0: x1*x2 = c. Тут c = ${c}, тому добуток = ${answer}.`;
    } else if (level === 3) {
        const k = randInt(1, 8);
        question = `Дискримінант: x² − ${2 * k}x + ${k * k} = 0`;
        answer = "0";
        explanation = `Це повний квадрат: x² − 2*${k}x + ${k}² = (x − ${k})². Для такого рівняння D = 0.`;
    } else {
        const a = randInt(2, 4);
        const b = randInt(3, 12);
        const c = randInt(1, 8);
        const D = b * b - 4 * a * c;
        question = `Дискримінант: ${a}x² + ${b}x + ${c} = 0`;
        answer = String(D);
        explanation = `Формула: D = b² − 4ac = ${b}² − 4*${a}*${c} = ${b * b} − ${4 * a * c} = ${D}.`;
    }
    return { question, answer, wrongAnswers: makeWrongNumeric(answer), explanation };
}

/**
 * @returns {{ question: string, answer: string, wrongAnswers: string[], explanation: string, timeLimit: number, reward: number }}
 */
export function generateTrainingTask(topicRaw, levelRaw) {
    const topic = normalizeTopicKey(topicRaw);
    const level = Math.min(4, Math.max(1, parseInt(levelRaw, 10) || 1));

    let task;
    if (topic === "Powers") task = genPowers(level);
    else if (topic === "Quadratics") task = genQuadratics(level);
    else task = genFractions(level);

    const baseTime = 55 + level * 22;
    const baseReward = 6 + level * 4;

    return {
        question: task.question,
        answer: task.answer,
        wrongAnswers: task.wrongAnswers,
        explanation: task.explanation || "",
        timeLimit: baseTime,
        reward: baseReward
    };
}
