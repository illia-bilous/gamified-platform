// src/shopData.js
import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Стандартні дані (використовуються, якщо у вчителя ще немає власних налаштувань)
const DEFAULT_ITEMS = {
    micro: [
        { id: "m1", name: "Магічна Підказка", desc: "Один раз в симуляторі", price: 200 },
        { id: "m2", name: "Щит від Помилки", desc: "1 помилка не зараховується", price: 300 }
    ],
    medium: [
        { id: "md1", name: "Звільнення від ДЗ", desc: "Одне домашнє завдання", price: 1000 },
        { id: "md2", name: "+1 бал до контрольної", desc: "По темі пройденого замку", price: 1500 },
        { id: "md3", name: "+1 бал до КР", desc: "По будь-якій темі", price: 3500 }
    ],
    large: [
        { id: "l1", name: "10 балів", desc: "По будь-якій темі", price: 8000 },
        { id: "l2", name: "+1 бал до семестрової", desc: "Бонус в кінці семестру", price: 10000 },
        { id: "l3", name: "+1 бал до річної", desc: "Легендарна нагорода", price: 15000 }
    ]
};

// 👇 1. Отримати товари КОНКРЕТНОГО ВЧИТЕЛЯ
export async function getShopItems(teacherUid) {
    // Якщо ID вчителя не передали (наприклад, глюк або адмін), повертаємо стандарт
    if (!teacherUid) {
        console.warn("⚠️ getShopItems викликано без teacherUid. Повертаємо стандартні.");
        return DEFAULT_ITEMS;
    }

    try {
        // Шукаємо в документі вчителя в колекції "users"
        const docRef = doc(db, "users", teacherUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Якщо у вчителя є налаштування 'treasuryConfig', повертаємо їх
            if (data.treasuryConfig) {
                return data.treasuryConfig;
            }
        }
    } catch (error) {
        console.error("Помилка завантаження магазину:", error);
    }

    // Якщо нічого не знайшли або сталася помилка — повертаємо базу
    return DEFAULT_ITEMS;
}

// 👇 2. Зберегти налаштування магазину (Тільки для вчителя)
export async function saveShopItems(teacherUid, newItems) {
    if (!teacherUid) return;

    try {
        const teacherRef = doc(db, "users", teacherUid);
        
        // Оновлюємо поле treasuryConfig у вчителя
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

// 👇 3. Допоміжна функція пошуку (Локальна)
export function findItemInList(shopData, itemId) {
    if (!shopData) return null;
    const all = [...(shopData.micro || []), ...(shopData.medium || []), ...(shopData.large || [])];
    return all.find(i => i.id === itemId);
}