import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Стандартні дані (на випадок, якщо база пуста)
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

// 👇 1. Отримати товари з БАЗИ ДАНИХ (Async)
export async function getShopItems() {
    try {
        const shopRef = doc(db, "globalSettings", "shop");
        const snapshot = await getDoc(shopRef);

        if (snapshot.exists()) {
            return snapshot.data();
        } else {
            // Якщо магазину ще немає в базі, створюємо його
            console.log("Creating default shop in DB...");
            await setDoc(shopRef, DEFAULT_ITEMS);
            return DEFAULT_ITEMS;
        }
    } catch (error) {
        console.error("Error getting shop items:", error);
        return DEFAULT_ITEMS; // Повертаємо стандартні, якщо помилка
    }
}

// 👇 2. Оновити ціну в БАЗІ ДАНИХ (Async)
// Саме цю функцію ми викликаємо в teacherPanel.js
export async function updateItemPriceInDB(itemId, newPrice) {
    try {
        const shopRef = doc(db, "globalSettings", "shop");
        const snapshot = await getDoc(shopRef);

        if (!snapshot.exists()) return false;

        let data = snapshot.data();
        let found = false;

        // Шукаємо товар у всіх категоріях і оновлюємо ціну
        ["micro", "medium", "large"].forEach(category => {
            const list = data[category];
            const itemIndex = list.findIndex(i => i.id === itemId);
            if (itemIndex !== -1) {
                list[itemIndex].price = parseInt(newPrice);
                found = true;
            }
        });

        if (found) {
            await updateDoc(shopRef, data);
            console.log(`Price updated for ${itemId}`);
            return true;
        }
        return false;

    } catch (error) {
        console.error("Error updating price:", error);
        return false;
    }
}

// 👇 3. Допоміжна функція пошуку (можна залишити локальною або async, але для UI зручніше так)
// Увага: Ця функція працює з переданим списком, а не лізе в базу сама
export function findItemInList(allShopItems, itemId) {
    if (!allShopItems) return null;
    const all = [...(allShopItems.micro || []), ...(allShopItems.medium || []), ...(allShopItems.large || [])];
    return all.find(i => i.id === itemId);
}