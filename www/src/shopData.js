import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ЗАПАСНІ ДАНІ (FALLBACK)
// Використовуються ТІЛЬКИ якщо немає інтернету або база пуста
const FALLBACK_ITEMS = {
    micro: [
        { id: "m1", name: "+1 бал", desc: "По будь-якій темі", price: 200 },
        { id: "m2", name: "+1 бал до самостійної", desc: "По будь-якій темі", price: 300 },
        { id: "m3", name: "Щит від Помилки", desc: "1 помилка не зараховується", price: 300 }
    ],
    medium: [
        { id: "md1", name: "Звільнення від ДЗ", desc: "Одне домашнє завдання", price: 1000 },
        { id: "md2", name: "+1 бал до контрольної", desc: "По темі пройденого замку", price: 1500 },
        { id: "md3", name: "+10 балів", desc: "По будь-якій темі", price: 3500 }
    ],
    large: [
        { id: "l1", name: "10 балів до тематичної", desc: "По будь-якій темі", price: 8000 },
        { id: "l2", name: "+1 бал до семестрової", desc: "Бонус в кінці семестру", price: 10000 },
        { id: "l3", name: "+1 бал до річної", desc: "Легендарна нагорода", price: 15000 }
    ]
};

// 👇 1. Отримати товари (Пріоритет: Вчитель -> Глобальна БД -> Запасний варіант)
export async function getShopItems(teacherUid) {
    // ЕТАП 1: Перевіряємо, чи є персональні налаштування у вчителя
    if (teacherUid) {
        try {
            const userRef = doc(db, "users", teacherUid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.treasuryConfig) {
                    return data.treasuryConfig;
                }
            }
        } catch (error) {
            console.error("Помилка при завантаженні профілю вчителя:", error);
        }
    }

    // ЕТАП 2: Якщо у вчителя пусто, беремо ГЛОБАЛЬНУ конфігурацію
    try {
        // Звертаємось до колекції "глобальна_конфігурація", документ "магазин"
        const globalRef = doc(db, "global_config", "shop");
        const globalSnap = await getDoc(globalRef);

        if (globalSnap.exists()) {
            const data = globalSnap.data();
            
            // Перевірка: чи правильні назви полів у базі?
            if (data.micro || data.medium || data.large) {
                return data;
            } else {
                console.warn("⚠️ У базі знайдено документ, але поля названі неправильно (має бути micro, medium, large).");
            }
        } else {
             console.log("⚠️ Документ 'глобальна_конфігурація/магазин' не знайдено.");
        }
    } catch (error) {
        console.error("Помилка при завантаженні глобальної конфігурації:", error);
    }

    // ЕТАП 3: Якщо все пропало — беремо запасні дані з коду
    return FALLBACK_ITEMS;
}

// 👇 2. Зберегти налаштування магазину (Тільки для вчителя)
export async function saveShopItems(teacherUid, newItems) {
    if (!teacherUid) return;

    try {
        const teacherRef = doc(db, "users", teacherUid);
        await updateDoc(teacherRef, {
            treasuryConfig: newItems
        });
        console.log("✅ Скарбницю оновлено для вчителя:", teacherUid);
        return true;
    } catch (error) {
        console.error("Помилка збереження:", error);
        alert("Не вдалося зберегти зміни.");
        return false;
    }
}

// 👇 3. Допоміжна функція пошуку
export function findItemInList(shopData, itemId) {
    if (!shopData) return null;
    const all = [...(shopData.micro || []), ...(shopData.medium || []), ...(shopData.large || [])];
    return all.find(i => i.id === itemId);
}