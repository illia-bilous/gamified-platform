import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemById } from "./shopData.js";

// --- ФУНКЦІЯ ЗБЕРЕЖЕННЯ ---
function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    const allUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const index = allUsers.findIndex(u => u.email === user.email);
    if (index !== -1) {
        allUsers[index] = user;
        localStorage.setItem("users", JSON.stringify(allUsers));
    }
}

// 👇 Змінна для захисту від дублювання слухача Unity
let isListenerAdded = false;

export function initStudentPanel() {
    console.log("StudentPanel: Init...");
    
    let user = getCurrentUser();
    if (!user) return;

    // ✂️ ТУТ Я ВИДАЛИВ ЗАЙВИЙ КОД НАВІГАЦІЇ (Він вже є в router.js)

    // --- Логіка бонусу ---
    if (!user.profile.welcomeBonusReceived) {
        user.profile.gold = 2500;
        user.profile.welcomeBonusReceived = true;
        if (!user.profile.inventory) user.profile.inventory = [];
        saveUserData(user);
    }

    // --- Оновлення даних ---
    updateHomeDisplay(user);

    // --- Завантаження магазину ---
    const shopItems = getShopItems();
    // Малюємо полиці магазину
    renderShopSection("rewards-micro-list", shopItems.micro);
    renderShopSection("rewards-medium-list", shopItems.medium);
    renderShopSection("rewards-large-list", shopItems.large);

    // ==========================================
    // 🎮 ЛОГІКА UNITY
    // ==========================================

    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (!isListenerAdded) {
        window.addEventListener("message", function(event) {
            if (typeof event.data !== "string") return;
            
            if (event.data.startsWith("ADD_COINS|")) {
                const amount = parseInt(event.data.split("|")[1]);
                console.log(`Нараховуємо: ${amount} монет`);
                let currentUser = getCurrentUser(); 
                if (currentUser) {
                    currentUser.profile.gold += amount;
                    saveUserData(currentUser);
                    updateHomeDisplay(currentUser);
                }
            }

            if (event.data === "CLOSE_GAME") {
                closeUnityGame();
            }
        });
        isListenerAdded = true;
        console.log("System: Unity Listener Activated (ONCE)");
    }

    if (startBtn) {
        startBtn.onclick = () => {
            if (unityContainer) {
                unityContainer.classList.remove("hidden");
                startBtn.style.display = "none"; 

                if (!document.getElementById("btn-force-close-unity")) {
                    const closeBtn = document.createElement("button");
                    closeBtn.id = "btn-force-close-unity";
                    closeBtn.innerText = "✖ Закрити";
                    closeBtn.style.cssText = "margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 5px; float: right;";
                    closeBtn.onclick = closeUnityGame;
                    unityContainer.parentNode.insertBefore(closeBtn, unityContainer);
                }

                const iframe = unityContainer.querySelector("iframe");
                if (!iframe) {
                     const newIframe = document.createElement("iframe");
                     newIframe.src = "unity/index.html"; 
                     newIframe.style.width = "100%";
                     newIframe.style.height = "100%";
                     newIframe.style.border = "none";
                     unityContainer.appendChild(newIframe);
                }
            }
        };
    }

    window.closeUnityGame = function() {
        if (unityContainer) {
            unityContainer.classList.add("hidden");
            const iframe = unityContainer.querySelector("iframe");
            if (iframe) iframe.remove();
        }
        const closeBtn = document.getElementById("btn-force-close-unity");
        if (closeBtn) closeBtn.remove();
        
        if(startBtn) startBtn.style.display = "inline-block"; 
        
        user = getCurrentUser();
        updateHomeDisplay(user);
    };

    // --- Допоміжні функції ---

    function updateHomeDisplay(currentUser) {
        if (!currentUser) return;
        
        const nameEl = document.getElementById("student-name-display");
        const classEl = document.getElementById("student-class-display");
        const goldEl = document.getElementById("student-gold-display");

        if (nameEl) nameEl.textContent = currentUser.name;
        if (classEl) classEl.textContent = currentUser.className || "--";
        if (goldEl) {
            goldEl.textContent = currentUser.profile.gold;
            goldEl.classList.remove("pulse");
            void goldEl.offsetWidth;
            goldEl.classList.add("pulse");
        }

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
        if (!container) return; // Якщо блоку немає - виходимо мовчки
        
        container.innerHTML = "";

        // Перевірка на пустоту
        if (!items || items.length === 0) {
            container.innerHTML = "<div style='color:#aaa; font-style:italic;'>Тут поки пусто...</div>";
            return;
        }

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
            itemDiv.querySelector(".btn-buy").addEventListener("click", () => buyItem(item));
            container.appendChild(itemDiv);
        });
    }

    function buyItem(visualItem) {
        user = getCurrentUser(); 
        const realItem = findItemById(visualItem.id);

        if (!realItem) { alert("Товар не знайдено."); return; }
        if (realItem.price !== visualItem.price) { alert("Ціна змінилася. Сторінка оновлюється."); location.reload(); return; }

        if (user.profile.gold >= realItem.price) {
            user.profile.gold -= realItem.price;
            if (!user.profile.inventory) user.profile.inventory = [];
            user.profile.inventory.push({ name: realItem.name, date: new Date().toISOString() });
            saveUserData(user);
            updateHomeDisplay(user);
            alert(`Придбано: ${realItem.name}!`);
        } else {
            alert("Недостатньо золота!");
        }
    }
}