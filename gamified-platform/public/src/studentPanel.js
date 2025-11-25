import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemById } from "./shopData.js"; // <--- Імпортуємо базу товарів

function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    const allUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const index = allUsers.findIndex(u => u.email === user.email);
    if (index !== -1) {
        allUsers[index] = user;
        localStorage.setItem("users", JSON.stringify(allUsers));
    }
}

export function initStudentPanel() {
    console.log("StudentPanel: Ініціалізація...");
    
    let user = getCurrentUser();
    if (!user) return;

    // --- Логіка бонусу ---
    if (!user.profile.welcomeBonusReceived) {
        user.profile.gold = 2500;
        user.profile.welcomeBonusReceived = true;
        if (!user.profile.inventory) user.profile.inventory = [];
        saveUserData(user);
    }

    // --- Оновлення даних ---
    updateHomeDisplay(user);

    // --- Завантаження магазину з БД ---
    const shopItems = getShopItems(); // Беремо актуальні дані
    renderShopSection("rewards-micro-list", shopItems.micro);
    renderShopSection("rewards-medium-list", shopItems.medium);
    renderShopSection("rewards-large-list", shopItems.large);

    // --- Кнопка старту ---
    const startBtn = document.getElementById("btn-start-lesson");
    if (startBtn) {
        startBtn.onclick = () => {
            const unityContainer = document.getElementById("unity-container");
            if (unityContainer) {
                unityContainer.classList.remove("hidden");
                if (!unityContainer.querySelector("iframe")) {
                     unityContainer.innerHTML = `<iframe src="unity/index.html" style="width:100%; height:600px; border:none;"></iframe>`;
                }
            }
        };
    }

    // --- Функції ---

    function updateHomeDisplay(currentUser) {
        document.getElementById("student-name-display").textContent = currentUser.name;
        document.getElementById("student-email-display").textContent = currentUser.email;
        document.getElementById("student-class-display").textContent = currentUser.className || "Не вказано";
        document.getElementById("student-gold-display").textContent = currentUser.profile.gold;

        const listEl = document.getElementById("student-inventory-list");
        if (listEl) {
            listEl.innerHTML = "";
            if (!currentUser.profile.inventory || currentUser.profile.inventory.length === 0) {
                listEl.innerHTML = '<li class="empty-msg">Поки що пусто...</li>';
            } else {
                currentUser.profile.inventory.forEach(item => {
                    const li = document.createElement("li");
                    li.className = "inventory-item";
                    li.innerHTML = `<span>📜</span> ${item.name}`;
                    listEl.appendChild(li);
                });
            }
        }
    }

    function renderShopSection(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        items.forEach(item => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "shop-item";
            itemDiv.innerHTML = `
                <div class="shop-item-row">
                    <div class="item-name">${item.name}</div>
                    <div class="item-price">${item.price} 💰</div>
                </div>
                <div class="item-desc">${item.desc}</div>
                <button class="btn-buy" data-id="${item.id}">Купити</button>
            `;
            
            // Передаємо item у функцію покупки
            itemDiv.querySelector(".btn-buy").addEventListener("click", () => buyItem(item));
            container.appendChild(itemDiv);
        });
    }

    function buyItem(visualItem) {
        user = getCurrentUser(); 

        // 1. ВАЖЛИВО: Перевіряємо актуальну ціну в базі перед списанням!
        // visualItem - це те, що ми бачимо на екрані (могло застаріти)
        // realItem - це те, що зараз в базі
        const realItem = findItemById(visualItem.id);

        if (!realItem) {
            alert("Помилка: Товар більше не існує.");
            return;
        }

        // Якщо ціна змінилася
        if (realItem.price !== visualItem.price) {
            alert(`Увага! Вчитель змінив ціну на "${realItem.name}".\nСтара ціна: ${visualItem.price}\nНова ціна: ${realItem.price}\nСторінку буде оновлено.`);
            location.reload(); // Перезавантажуємо сторінку, щоб показати нові ціни
            return;
        }

        // Якщо ціна актуальна - купуємо
        if (user.profile.gold >= realItem.price) {
            user.profile.gold -= realItem.price;
            if (!user.profile.inventory) user.profile.inventory = [];
            user.profile.inventory.push({ name: realItem.name, date: new Date().toISOString() });

            saveUserData(user);
            updateHomeDisplay(user);
            
            const goldDisplay = document.getElementById("student-gold-display");
            goldDisplay.classList.add("pulse");
            setTimeout(() => goldDisplay.classList.remove("pulse"), 1000);

            alert(`Успішно придбано: ${realItem.name}!`);
        } else {
            alert("Недостатньо золота!");
        }
    }
}