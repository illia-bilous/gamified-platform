// src/shopData.js

// Початкові дані (якщо база пуста)
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

// Отримати всі товари (з LocalStorage або дефолтні)
export function getShopItems() {
    const stored = localStorage.getItem("shopItems");
    if (stored) {
        return JSON.parse(stored);
    } else {
        // Перший запуск: зберігаємо дефолтні і повертаємо їх
        localStorage.setItem("shopItems", JSON.stringify(DEFAULT_ITEMS));
        return DEFAULT_ITEMS;
    }
}

// Оновити ціну товару (для Вчителя)
export function updateItemPrice(itemId, newPrice) {
    const items = getShopItems();
    
    // Проходимо по всіх категоріях, щоб знайти товар за ID
    for (const category in items) {
        const product = items[category].find(p => p.id === itemId);
        if (product) {
            product.price = parseInt(newPrice);
            localStorage.setItem("shopItems", JSON.stringify(items)); // Зберігаємо зміни
            return true;
        }
    }
    return false;
}

// Знайти актуальний товар за ID (для перевірки перед покупкою Учнем)
export function findItemById(itemId) {
    const items = getShopItems();
    for (const category in items) {
        const product = items[category].find(p => p.id === itemId);
        if (product) return product;
    }
    return null;
}