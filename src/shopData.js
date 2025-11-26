// src/shopData.js

// Початкові дані (Ті самі, що на твоєму скріншоті)
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

// Отримати всі товари (з захистом від пустоти)
export function getShopItems() {
    const stored = localStorage.getItem("shopItems");
    
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // Якщо база "бита" або пуста - відновлюємо
            if (!parsed.micro || parsed.micro.length === 0) {
                console.warn("ShopData: База пуста. Відновлюємо...");
                localStorage.setItem("shopItems", JSON.stringify(DEFAULT_ITEMS));
                return DEFAULT_ITEMS;
            }
            return parsed;
        } catch (e) {
            return DEFAULT_ITEMS;
        }
    } else {
        // Перший запуск
        localStorage.setItem("shopItems", JSON.stringify(DEFAULT_ITEMS));
        return DEFAULT_ITEMS;
    }
}

// Оновити ціну (для вчителя)
export function updateItemPrice(itemId, newPrice) {
    const items = getShopItems();
    const allLists = [items.micro, items.medium, items.large];
    
    for (let list of allLists) {
        const product = list.find(p => p.id === itemId);
        if (product) {
            product.price = parseInt(newPrice);
            localStorage.setItem("shopItems", JSON.stringify(items));
            return true;
        }
    }
    return false;
}

// Знайти товар за ID
export function findItemById(itemId) {
    const items = getShopItems();
    const all = [...items.micro, ...items.medium, ...items.large];
    return all.find(i => i.id === itemId);
}