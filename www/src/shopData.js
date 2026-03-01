import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. СИСТЕМНІ ПРЕДМЕТИ (Їх не можна змінити, вони завжди додаються в початок)
export const SYSTEM_BOOSTERS = {
    micro: [
        { id: "sys_shield", name: "Щит від помилки", desc: "Дозволяє один раз помилитися", price: 150, icon: "🛡️", isSystem: true }
    ],
    medium: [
        { id: "sys_time", name: "Додатковий час", desc: "Додає +30 секунд на рівень", price: 300, icon: "⏳", isSystem: true }
    ],
    large: [
        { id: "sys_radar", name: "Радар (підказка)", desc: "Показує правильну відповідь", price: 600, icon: "📡", isSystem: true }
    ]
};

// 2. ЗАПАСНІ ДАНІ (Якщо в базі взагалі порожньо)
export const FALLBACK_ITEMS = {
    micro: [
        { id: "m1", name: "+1 бал", desc: "За активність на уроці", price: 200 },
        { id: "m2", name: "Стикер", desc: "Колекційна нагорода", price: 100 }
    ],
    medium: [
        { id: "md1", name: "Звільнення від ДЗ", desc: "На один раз", price: 1000 }
    ],
    large: [
        { id: "l1", name: "Амулет 'Автомат'", desc: "Звільнення від тематичної", price: 10000 }
    ]
};

// 3. ГОЛОВНА ФУНКЦІЯ ОТРИМАННЯ ТОВАРІВ
export async function getShopItems(teacherUid) {
    let baseItems = { micro: [], medium: [], large: [] };

    try {
        let dataFound = null;

        // Пріоритет 1: Конфігурація конкретного вчителя
        if (teacherUid) {
            const userSnap = await getDoc(doc(db, "users", teacherUid));
            if (userSnap.exists() && userSnap.data().treasuryConfig) {
                dataFound = userSnap.data().treasuryConfig;
            }
        }
        
        // Пріоритет 2: Глобальна конфігурація
        if (!dataFound) {
            const globalSnap = await getDoc(doc(db, "global_config", "shop"));
            if (globalSnap.exists()) {
                dataFound = globalSnap.data();
            }
        }

        baseItems = dataFound || FALLBACK_ITEMS;

    } catch (e) {
        console.error("Shop Load Error:", e);
        baseItems = FALLBACK_ITEMS;
    }

    // --- МАГІЯ ВИПРАВЛЕННЯ ТУТ ---
    
    // Функція-помічник для розумного злиття категорій
    const mergeCategory = (systemArray, teacherArray) => {
        const safeTeacherArray = teacherArray || [];
        
        // 1. Беремо системні предмети, але якщо вони є в базі вчителя — оновлюємо їх ціну/опис
        const mergedSystems = systemArray.map(sysItem => {
            const teacherVersion = safeTeacherArray.find(t => t.id === sysItem.id);
            if (teacherVersion) {
                return { ...sysItem, ...teacherVersion }; // Дані вчителя перекривають системні
            }
            return sysItem;
        });

        // 2. Додаємо всі інші предмети вчителя, які НЕ є системними
        const teacherOnlyItems = safeTeacherArray.filter(t => 
            !systemArray.some(s => s.id === t.id)
        );

        return [...mergedSystems, ...teacherOnlyItems];
    };

    return {
        micro: mergeCategory(SYSTEM_BOOSTERS.micro, baseItems.micro),
        medium: mergeCategory(SYSTEM_BOOSTERS.medium, baseItems.medium),
        large: mergeCategory(SYSTEM_BOOSTERS.large, baseItems.large)
    };
}

// 4. ЗБЕРЕЖЕННЯ (Тільки для вчителя)
export async function saveShopItems(teacherUid, newItems) {
    if (!teacherUid) return;
    try {
        const teacherRef = doc(db, "users", teacherUid);
        await updateDoc(teacherRef, { treasuryConfig: newItems });
        return true;
    } catch (error) {
        console.error("Save Error:", error);
        return false;
    }
}

// 5. ПОШУК ПРЕДМЕТА ЗА ID
export function findItemInList(shopData, itemId) {
    if (!shopData) return null;
    const all = [...(shopData.micro || []), ...(shopData.medium || []), ...(shopData.large || [])];
    return all.find(i => i.id === itemId);
}