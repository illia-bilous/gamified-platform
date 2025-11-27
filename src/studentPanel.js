import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemById } from "./shopData.js";

function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    const allUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const index = allUsers.findIndex(u => u.email === user.email);
    if (index !== -1) {
        allUsers[index] = user;
        localStorage.setItem("users", JSON.stringify(allUsers));
    }
}

// Допоміжна функція для отримання всіх користувачів (для лідерборду)
function getAllUsersFromDB() {
    return JSON.parse(localStorage.getItem("users") || "[]");
}

let isListenerAdded = false;

export function initStudentPanel() {
    console.log("StudentPanel: Init (Leaderboard included)...");
    
    let user = getCurrentUser();
    if (!user) return;

    if (!user.profile.welcomeBonusReceived) {
        user.profile.gold = 2500;
        user.profile.welcomeBonusReceived = true;
        if (!user.profile.inventory) user.profile.inventory = [];
        saveUserData(user);
    }

    updateHomeDisplay(user);
    
    // 👇 ЗАПУСКАЄМО ГЕНЕРАЦІЮ ЛІДЕРБОРДУ
    renderLeaderboard(user);

    const shopItems = getShopItems();
    renderShopSection("rewards-micro-list", shopItems.micro);
    renderShopSection("rewards-medium-list", shopItems.medium);
    renderShopSection("rewards-large-list", shopItems.large);

    // --- UNITY LOGIC ---
    const unityContainer = document.getElementById("unity-container");
    const startBtn = document.getElementById("btn-start-lesson");

    if (!isListenerAdded) {
        window.addEventListener("message", function(event) {
            if (typeof event.data !== "string") return;
            
            if (event.data.startsWith("ADD_COINS|")) {
                const amount = parseInt(event.data.split("|")[1]);
                let currentUser = getCurrentUser(); 
                if (currentUser) {
                    currentUser.profile.gold += amount;
                    saveUserData(currentUser);
                    updateHomeDisplay(currentUser);
                    // Оновлюємо лідерборд, бо золото змінилось
                    renderLeaderboard(currentUser); 
                }
            }
            if (event.data === "CLOSE_GAME") {
                closeUnityGame();
            }
        });
        isListenerAdded = true;
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
        renderLeaderboard(user);
    };

    // ==========================================
    // 🏆 ЛОГІКА ЛІДЕРБОРДУ
    // ==========================================
    function renderLeaderboard(currentUser) {
        const container = document.getElementById("view-leaderboard");
        if (!container) return;

        // Очищаємо контейнер
        container.innerHTML = `
            <h2 style="text-align:center; margin-bottom:20px;">🏆 Рейтинг класу ${currentUser.className || ""}</h2>
            <div class="leaderboard-wrapper">
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th style="width: 10%;">#</th>
                            <th style="width: 60%; text-align: left;">Учень</th>
                            <th style="width: 30%;">Золото</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboard-body"></tbody>
                </table>
            </div>
        `;

        const tbody = document.getElementById("leaderboard-body");
        const allUsers = getAllUsersFromDB();

        // 1. Фільтруємо: тільки учні, тільки з мого класу
        const classmates = allUsers.filter(u => 
            u.role === "student" && 
            u.className === currentUser.className
        );

        // 2. Сортуємо: у кого більше золота - той вище
        classmates.sort((a, b) => (b.profile.gold || 0) - (a.profile.gold || 0));

        // 3. Малюємо рядки
        if (classmates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px;">Клас пустий...</td></tr>`;
            return;
        }

        classmates.forEach((student, index) => {
            const tr = document.createElement("tr");
            
            // Якщо це я - підсвічуємо
            if (student.email === currentUser.email) {
                tr.className = "my-rank";
            }

            // Медальки для топ-3
            let rankDisplay = index + 1;
            if (index === 0) rankDisplay = "🥇 1";
            if (index === 1) rankDisplay = "🥈 2";
            if (index === 2) rankDisplay = "🥉 3";

            tr.innerHTML = `
                <td class="rank-col">${rankDisplay}</td>
                <td class="name-col">${student.name}</td>
                <td class="gold-col">${student.profile.gold || 0} 💰</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ==========================================
    // ІНВЕНТАР ТА ІНШЕ
    // ==========================================

    function updateHomeDisplay(currentUser) {
        if (!currentUser) return;
        document.getElementById("student-name-display").textContent = currentUser.name;
        document.getElementById("student-class-display").textContent = currentUser.className || "--";
        const goldEl = document.getElementById("student-gold-display");
        if (goldEl) {
            goldEl.textContent = currentUser.profile.gold;
            goldEl.classList.remove("pulse");
            void goldEl.offsetWidth;
            goldEl.classList.add("pulse");
        }

        const listEl = document.getElementById("student-inventory-list");
        if (listEl) {
            listEl.innerHTML = "";
            const userInv = currentUser.profile.inventory || [];

            // Робимо контейнер схожим на сітку магазину
            listEl.className = "treasury-grid"; 
            listEl.style.padding = "0";
            listEl.style.marginTop = "20px";
            listEl.style.display = "flex"; 

            const shopDB = getShopItems();

            const createColumn = (title, dbItems) => {
                const itemsInCat = dbItems.filter(shopItem => 
                    userInv.some(uItem => uItem.name === shopItem.name)
                );

                let contentHtml = "";
                if (itemsInCat.length === 0) {
                    contentHtml = `<div class="inv-empty-category">Ще не куплено...</div>`;
                } else {
                    itemsInCat.forEach(shopItem => {
                        const count = userInv.filter(uItem => uItem.name === shopItem.name).length;
                        const badge = count > 1 ? `<span class="item-count">x${count}</span>` : "";
                        contentHtml += `
                            <div class="inventory-card-item">
                                <div class="inv-name">${shopItem.name} ${badge}</div>
                                <div class="inv-desc">${shopItem.desc}</div>
                            </div>
                        `;
                    });
                }
                return `
                    <div class="reward-column">
                        <div class="reward-header">${title}</div>
                        <div class="dashed-line"></div>
                        <div class="inventory-column-content">${contentHtml}</div>
                    </div>
                `;
            };

            let finalHtml = "";
            finalHtml += createColumn("Мої Мікро-нагороди", shopDB.micro);
            finalHtml += createColumn("Мої Середні нагороди", shopDB.medium);
            finalHtml += createColumn("Мої Великі нагороди", shopDB.large);
            listEl.innerHTML = finalHtml;
        }
    }

    function renderShopSection(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        if (!items || items.length === 0) {
            container.innerHTML = "<div style='color:#aaa; font-style:italic;'>Пусто...</div>";
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
            user.profile.inventory.push({ id: realItem.id, name: realItem.name, date: new Date().toISOString() });
            saveUserData(user);
            updateHomeDisplay(user);
            alert(`Придбано: ${realItem.name}!`);
        } else {
            alert("Недостатньо золота!");
        }
    }
}