// src/studentPanel.js

import { getCurrentUser } from "./auth.js";
import { getShopItems, findItemById } from "./shopData.js";
import { db } from "./firebase.js"; 
// 👇 Важливі імпорти для читання налаштувань гри
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function saveUserData(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
    if (user.uid) {
        try {
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { profile: user.profile });
        } catch (e) {
            console.error("Помилка збереження в хмару:", e);
        }
    }
}

let isListenerAdded = false;

// 👇 Функція стала ASYNC, щоб зачекати на завантаження конфігу з бази
export async function initStudentPanel() {
    console.log("StudentPanel: Init (Load Cloud Config)...");
    
    // --- 🌍 1. ЗАВАНТАЖЕННЯ КОНФІГУРАЦІЇ ГРИ З ХМАРИ ---
    try {
        // Читаємо налаштування, які зберіг вчитель
        const configRef = doc(db, "game_config", "maze_1");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const gameData = configSnap.data();
            // 🔥 КЛЮЧОВИЙ МОМЕНТ: Записуємо дані з хмари в локальну пам'ять учня
            // Unity прочитає їх звідси, коли запуститься!
            localStorage.setItem("game_config_data", JSON.stringify(gameData));
            console.log("🎮 Config updated from Cloud:", gameData);
        } else {
            console.log("⚠️ Config not found in Cloud, using local defaults.");
        }
    } catch (e) {
        console.error("Failed to load game config:", e);
    }
    // ----------------------------------------------------

    let user = getCurrentUser();
    if (!user) return;

    updateHomeDisplay(user);
    renderLeaderboard(user);

    const shopItems = getShopItems();
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
                let currentUser = getCurrentUser(); 
                if (currentUser) {
                    currentUser.profile.gold += amount;
                    saveUserData(currentUser); // Зберігаємо в базу
                    updateHomeDisplay(currentUser);
                    setTimeout(() => renderLeaderboard(currentUser), 1000);
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
                     // Додаємо ?v=... для боротьби з кешем
                     newIframe.src = "unity/index.html?v=" + new Date().getTime(); 
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
    // 🏆 ПОВНІ ФУНКЦІЇ ВІДОБРАЖЕННЯ
    // ==========================================

    async function renderLeaderboard(currentUser) {
        const container = document.getElementById("view-leaderboard");
        if (!container) return;

        container.innerHTML = `
            <div class="teacher-header">
                <h2>🏆 Рейтинг класу ${currentUser.className || ""}</h2>
            </div>
            <div style="background: #222; padding: 20px; border-radius: 10px; min-height: 300px;">
                <table class="leaderboard-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                    <thead>
                        <tr style="color: #aaa; text-align: left; background: transparent; box-shadow: none;">
                            <th style="padding: 10px 20px; border:none;">#</th>
                            <th style="width: 60%; text-align: left; border:none;">Учень</th>
                            <th style="width: 30%; border:none;">Золото</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboard-body">
                        <tr><td colspan="3" style="text-align:center; padding:20px; color:#777;">Завантаження... ⏳</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        const tbody = document.getElementById("leaderboard-body");

        try {
            const q = query(
                collection(db, "users"),
                where("role", "==", "student"),
                where("className", "==", currentUser.className),
                where("teacherUid", "==", currentUser.teacherUid) // 🔥 Фільтруємо по вчителю, щоб не бачити чужих 8-А
            );

            const querySnapshot = await getDocs(q);
            const classmates = [];
            querySnapshot.forEach((doc) => {
                classmates.push({ ...doc.data(), uid: doc.id }); // Зберігаємо ID для перевірки "Це Я"
            });

            // Сортування
            classmates.sort((a, b) => (b.profile.gold || 0) - (a.profile.gold || 0));

            if (classmates.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#777;">Клас пустий...</td></tr>`;
                return;
            }

            tbody.innerHTML = "";

            classmates.forEach((student, index) => {
                const tr = document.createElement("tr");
                
                // --- 🔥 ЛОГІКА РАНГІВ (ЯК У ВЧИТЕЛЯ) ---
                let rankClass = "rank-other"; 
                let rankIcon = `#${index + 1}`;
                
                if (index === 0) { rankClass = "rank-1"; rankIcon = "👑 1"; }
                else if (index === 1) { rankClass = "rank-2"; rankIcon = "🥈 2"; }
                else if (index === 2) { rankClass = "rank-3"; rankIcon = "🥉 3"; }

                // Присвоюємо клас рядку!
                tr.className = rankClass;

                // --- 🔥 ПІДСВІТКА "ЦЕ Я" ---
                // Якщо це поточний юзер -> додаємо зелену рамку
                if (student.uid === currentUser.uid) {
                    tr.classList.add("is-current-user");
                }

                tr.innerHTML = `
                    <td class="rank-col" style="font-weight:bold;">${rankIcon}</td>
                    <td class="name-col" style="font-size: 1.1em; color: white;">${student.name}</td>
                    <td class="gold-col" style="color: #f1c40f; font-weight: bold;">${student.profile.gold || 0} 💰</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error("Помилка лідерборду:", error);
            tbody.innerHTML = `<tr><td colspan="3" style="color:#e74c3c; text-align:center;">Помилка завантаження даних</td></tr>`;
        }
    }

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

            if (userInv.length === 0) {
                listEl.innerHTML = '<li class="empty-msg" style="width:100%; text-align:center;">Поки що пусто...</li>';
                listEl.style.display = "block"; 
                return;
            }

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
                        const badge = `<span class="item-count">x${count}</span>`;
                        
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
                        <div class="inventory-column-content">
                            ${contentHtml}
                        </div>
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
        let u = getCurrentUser(); 
        const realItem = findItemById(visualItem.id);

        if (!realItem) { alert("Товар не знайдено."); return; }
        if (realItem.price !== visualItem.price) { alert("Ціна змінилася. Сторінка оновлюється."); location.reload(); return; }

        if (u.profile.gold >= realItem.price) {
            u.profile.gold -= realItem.price;
            if (!u.profile.inventory) u.profile.inventory = [];
            
            u.profile.inventory.push({ 
                id: realItem.id, 
                name: realItem.name, 
                date: new Date().toISOString() 
            });
            
            saveUserData(u); 
            updateHomeDisplay(u);
            renderLeaderboard(u); 
            alert(`Придбано: ${realItem.name}!`);
        } else {
            alert("Недостатньо золота!");
        }
    }
}