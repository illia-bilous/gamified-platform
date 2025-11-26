import { getShopItems, updateItemPrice } from "./shopData.js"; // <--- Імпортуємо логіку магазину

// Зберігаємо ключ, під яким будуть лежати налаштування гри
const GAME_CONFIG_KEY = "game_config_data";

export function initTeacherPanel() {
    console.log("TeacherPanel: Init...");

    // 1. Завантажуємо налаштування гри (Unity)
    loadGameSettings();

    // 2. Обробка кнопки "Зберегти" для гри
    const saveBtn = document.getElementById("btn-save-game-settings");
    if (saveBtn) {
        saveBtn.onclick = saveGameSettings;
    }

    // 3. 👇 ЗАВАНТАЖУЄМО РЕДАКТОР СКАРБНИЦІ (НОВЕ)
    renderTreasuryEditor();
}

// =================================================
// 🛍️ ЛОГІКА РЕДАКТОРА СКАРБНИЦІ
// =================================================

function renderTreasuryEditor() {
    console.log("Rendering Treasury Editor...");
    const items = getShopItems(); // Беремо товари з твого shopData.js

    // Рендеримо 3 категорії у відповідні блоки в HTML
    renderCategory("teacher-rewards-micro", items.micro);
    renderCategory("teacher-rewards-medium", items.medium);
    renderCategory("teacher-rewards-large", items.large);
}

function renderCategory(containerId, itemList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = ""; // Очищаємо перед малюванням

    itemList.forEach(item => {
        // Створюємо картку редагування товару
        const div = document.createElement("div");
        div.className = "shop-item";
        div.style.background = "#222"; // Темніший фон для редактора
        div.style.border = "1px solid #444";

        div.innerHTML = `
            <div class="shop-item-row">
                <div class="item-name" style="color: #eee;">${item.name}</div>
                <div style="width: 45%; text-align: right;">
                    <input type="number" id="price-${item.id}" value="${item.price}" 
                           style="width: 70px; padding: 5px; background: #333; color: gold; border: 1px solid #555; border-radius: 5px; text-align: center;">
                    💰
                </div>
            </div>
            <div class="item-desc" style="margin-bottom: 10px; font-size: 0.8rem; color: #aaa;">${item.desc}</div>
            <button class="btn-save-price" data-id="${item.id}" 
                    style="width: 100%; padding: 8px; background: #2ecc71; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; text-transform: uppercase;">
                💾 Зберегти ціну
            </button>
        `;

        // Додаємо логіку на кнопку "Зберегти"
        const btn = div.querySelector(".btn-save-price");
        btn.onclick = () => {
            const input = document.getElementById(`price-${item.id}`);
            const newPrice = input.value;
            
            // Викликаємо функцію оновлення з shopData.js
            const success = updateItemPrice(item.id, newPrice);
            
            if (success) {
                alert(`Ціну на "${item.name}" оновлено до ${newPrice}!`);
                input.style.borderColor = "#2ecc71"; // Зелена рамка як підтвердження
            } else {
                alert("Помилка збереження!");
            }
        };

        container.appendChild(div);
    });
}

// =================================================
// 🎮 ЛОГІКА НАЛАШТУВАНЬ ГРИ (UNITY)
// =================================================

function loadGameSettings() {
    // Дістаємо з пам'яті або беремо стандартні
    const rawData = localStorage.getItem(GAME_CONFIG_KEY);
    const config = rawData ? JSON.parse(rawData) : { reward: 10, btnText: "+10 Coins" };

    // Заповнюємо інпути
    const inputReward = document.getElementById("setting-reward-amount");
    const inputText = document.getElementById("setting-button-text");

    if (inputReward) inputReward.value = config.reward;
    if (inputText) inputText.value = config.btnText;
}

function saveGameSettings() {
    const inputReward = document.getElementById("setting-reward-amount");
    const inputText = document.getElementById("setting-button-text");
    const statusMsg = document.getElementById("settings-status");

    // Зчитуємо дані
    const newConfig = {
        reward: parseInt(inputReward.value) || 10,
        btnText: inputText.value || "+10 Coins"
    };

    // Зберігаємо в LocalStorage
    localStorage.setItem(GAME_CONFIG_KEY, JSON.stringify(newConfig));

    console.log("Teacher: Game settings saved:", newConfig);

    // Показуємо повідомлення "Збережено"
    if (statusMsg) {
        statusMsg.style.display = "block";
        setTimeout(() => statusMsg.style.display = "none", 3000);
    }
}