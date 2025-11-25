import { getShopItems, updateItemPrice } from "./shopData.js"; // Імпорт функцій магазину

export function initTeacherPanel() {
    console.log("TeacherPanel: Ініціалізація...");
    
    // Запускаємо логіку редактора
    initTreasuryEditor();
}

function initTreasuryEditor() {
    // 1. Отримуємо товари з "бази"
    const shopItems = getShopItems();

    // 2. Рендеримо їх у відповідні колонки (які ми створили в HTML вище)
    renderTeacherShopSection("teacher-rewards-micro", shopItems.micro);
    renderTeacherShopSection("teacher-rewards-medium", shopItems.medium);
    renderTeacherShopSection("teacher-rewards-large", shopItems.large);
}

function renderTeacherShopSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Контейнер #${containerId} не знайдено! Перевірте HTML.`);
        return;
    }
    container.innerHTML = "";

    items.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "shop-item"; 
        
        itemDiv.innerHTML = `
            <div class="shop-item-row">
                <div class="item-name">${item.name}</div>
                <div class="item-price" id="price-${item.id}">${item.price} 💰</div>
            </div>
            <div class="item-desc">${item.desc}</div>
            
            <button class="btn-edit-price" data-id="${item.id}" style="
                background: transparent; 
                border: 1px solid #f39c12; 
                color: #f39c12; 
                width: 100%; 
                padding: 8px; 
                border-radius: 8px; 
                cursor: pointer;
                text-transform: uppercase;
                font-weight: bold;
                margin-top: 5px;
                font-size: 0.8rem;">
                ✏️ Редагувати ціну
            </button>
        `;

        // Логіка зміни ціни
        const btn = itemDiv.querySelector(".btn-edit-price");
        btn.addEventListener("click", () => {
            const newPriceStr = prompt(`Введіть нову ціну для "${item.name}":`, item.price);
            
            if (newPriceStr !== null) {
                const newPrice = parseInt(newPriceStr);
                if (!isNaN(newPrice) && newPrice >= 0) {
                    // Оновлюємо в базі
                    updateItemPrice(item.id, newPrice);
                    
                    // Оновлюємо на екрані
                    document.getElementById(`price-${item.id}`).textContent = `${newPrice} 💰`;
                    item.price = newPrice; 
                } else {
                    alert("Будь ласка, введіть коректне число.");
                }
            }
        });

        container.appendChild(itemDiv);
    });
}