"use strict";

/* ============================================================
   0) ГЛОБАЛИ + УТИЛІТИ
   ============================================================ */
let data;
let div_num;
let main_page;

const num = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const css = (el, name, fb = 0) => getComputedStyle(el).getPropertyValue(name) || fb;
function collectChips(container) {
    return [...container.querySelectorAll(".chip.active")].map((b) => b.textContent.trim());
}

/* ---- NEW: debounce (фікс ReferenceError) ---- */
function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), ms);
    };
}
function getCurrentUserEmail() {
    try {
        // 1) НОВИЙ формат — authUser
        const rawAuth = localStorage.getItem("authUser");
        if (rawAuth) {
            const u = JSON.parse(rawAuth);
            if (u?.email) return u.email;
        }

        // 2) СТАРИЙ формат — currentUser (на всякий випадок)
        const rawLegacy = localStorage.getItem("currentUser");
        if (rawLegacy) {
            const u = JSON.parse(rawLegacy);
            return u.email || null;
        }

        return null;
    } catch {
        return null;
    }
}

/* ============================================================
   1) ГОЛОВНА / HERO / ШАПКА
   ============================================================ */
AOS.init();
// Back to top
jQuery(function () {
    jQuery(window).scroll(function () {
        jQuery("#myBtn").css("opacity", jQuery(this).scrollTop() > 600 ? "1" : "0");
    });
    jQuery("#myBtn").click(function () {
        jQuery("body,html").animate({ scrollTop: 0 }, 200);
        return false;
    });
});
// Cart open
document.addEventListener("click", (e) => {
    const a = e.target.closest("a.cart");
    if (!a) return;
    e.preventDefault();
    openCart();
});

// HERO: легка пульсація кнопки
(function () {
    const btn = document.querySelector(".hero .btn.btn-primary");
    if (!btn) return;
    const key = document.createElement("style");
    key.textContent = `@keyframes subtlePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(115,21,54,0);}40%{transform:scale(1.03);box-shadow:0 10px 22px rgba(115,21,54,.22);}}`;
    document.head.appendChild(key);
    setInterval(() => {
        btn.style.animation = "subtlePulse 1.2s ease";
        setTimeout(() => (btn.style.animation = ""), 1300);
    }, 4000);
})();

// HERO: падіння інгредієнтів і поява страви (як було) ...
(function () {
    const EASE_FALL = "cubic-bezier(.25,.8,.3,1)";
    const D_FALL = 2200;
    const D_VANISH = 500;
    const GAP_AFTER = 180;
    const PASTA_LIFT = 56;
    const TOPPING_ON_PASTA = 46;

    function landingYBase() {
        const visual = document.querySelector(".hero__visual");
        const plate = visual?.querySelector(".plate");
        const holder = visual?.querySelector(".ingredients");
        if (!visual || !plate || !holder) return 0;
        const pr = plate.getBoundingClientRect();
        const hr = holder.getBoundingClientRect();
        return Math.round(pr.top + pr.height * 0.58 - hr.top);
    }

    function animateHero() {
        const visual = document.querySelector(".hero__visual");
        const dish = document.getElementById("heroDish");
        const ings = Array.from(document.querySelectorAll(".ingredient"));
        if (!visual || !dish || !ings.length) return;

        const baseY = landingYBase();
        const pastaY = baseY - PASTA_LIFT;

        const anims = ings.map((el) => {
            const x = num(css(el, "--x", 0));
            const rot = num(css(el, "--rot", 0));
            const delay = num(css(el, "--delay", 0)) * 1000;
            const isPasta = el.classList.contains("i-pasta");
            const endY = isPasta ? pastaY : pastaY + TOPPING_ON_PASTA;
            const midX = x * 0.18;
            const midY = endY - 14;

            const fall = el.animate(
                [
                    { transform: `translate3d(calc(-50% + ${x}px), -120%, 0) rotate(${rot}deg)`, opacity: 0 },
                    { offset: 0.12, opacity: 1 },
                    { transform: `translate3d(calc(-50% + ${midX}px), ${midY}px, 0) rotate(${rot * 0.25}deg)`, opacity: 1, offset: 0.8 },
                    { transform: `translate3d(-50%, ${endY}px, 0) rotate(0deg)`, opacity: 1 },
                ],
                { duration: D_FALL, delay, easing: EASE_FALL, fill: "forwards" }
            );

            fall.finished.then(() => {
                setTimeout(() => {
                    el.animate(
                        [
                            { filter: "saturate(1) blur(0px)", opacity: 1, transform: `translate3d(-50%, ${endY}px, 0)` },
                            { filter: "saturate(.75) blur(.5px)", opacity: 0, transform: `translate3d(-50%, ${endY + 2}px, 0)` },
                        ],
                        { duration: D_VANISH, easing: "ease-out", fill: "forwards" }
                    );
                }, GAP_AFTER);
            });

            el.style.zIndex = isPasta ? "1" : "2";
            return fall;
        });

        Promise.allSettled(anims.map((a) => a.finished)).then(() => {
            setTimeout(() => {
                visual.classList.add("dish-shown");
                dish.classList.add("show");
            }, GAP_AFTER + D_VANISH);
        });
    }

    function startWhenVisible() {
        const visual = document.querySelector(".hero__visual");
        if (!visual) return;
        if ("IntersectionObserver" in window) {
            const io = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        animateHero();
                        io.disconnect();
                    }
                },
                { threshold: 0.25 }
            );
            io.observe(visual);
        } else {
            animateHero();
        }
    }

    window.addEventListener("load", startWhenVisible);
})();

/* ============================================================
   2) MENU: завантаження, рендер, пагінація, рейтинг
   ============================================================ */
fetch("/api/dishes")
    .then((response) => response.json())
    .then((json) => {
        data = json;              // структура така сама { dish: [...] }
        const menuBlock = document.getElementById("menuParent");
        const newArr = data.dish.map((item) => item);

        newArr.forEach((item, index) => {
            menuBlock.insertAdjacentHTML("beforeend", renderDishItem(item, index + 1));
        });


        menuBlock.addEventListener("click", (e) => {
            const btn = e.target.closest("button, a");
            if (btn) return;
            const card = e.target.closest(".menu-block");
            if (!card) return;
            card.classList.toggle("flipped");
        });

        document.querySelectorAll(".button-shop-1").forEach((button, btnIndex) => {
            button.classList.add("add-to-cart");
            button.setAttribute("data-index", String(btnIndex));

            button.addEventListener("click", (e) => {
                e.stopPropagation();

                const dish = data.dish[btnIndex];
                if (!dish) return;

                addToCart({
                    id: dish.id ?? btnIndex,
                    title: dish.title,
                    price: dish.price,
                    image: `img/photo/menu/${dish.photo}.${dish.typePhoto}`,
                    description: dish.back?.short || dish.back?.long || ""
                });

                openCart();
            });
        });


        const count = newArr.length;
        const itemsPerPage = 8;
        const totalPages = Math.ceil(count / itemsPerPage);
        buildPaginator(totalPages);
        div_num = document.querySelectorAll(".num");

        div_num.forEach((item, index) => {
            item.style.display = index < itemsPerPage ? "flex" : "none";
        });

        main_page = document.getElementById("page1");
        main_page?.classList.add("paginator_active");

        document.getElementById("page-prev")?.addEventListener("click", () => changePage(-1));
        document.getElementById("page-next")?.addEventListener("click", () => changePage(1));

        initRatings();
        updateCartDisplay();
    })
    .catch((err) => console.error("Menu load error:", err));

function renderDishItem(item, itemId) {
    const {  id, title, price, stars, photo, typePhoto, back } = item;
    const grams  = back?.grams ?? null;        // для страв
    const volume = back?.volume_ml ?? null;    // для вин/напоїв
    // рейтинг (беремо з localStorage, як і було)
    const saved = (JSON.parse(localStorage.getItem("ratings") || "{}"))[title] || 0;
    const starsHTML = [...Array(5)]
        .map((_, i) => {
            const n = i + 1;
            const active = n <= saved ? "is-active" : "";
            return `<button class="star ${active}" data-value="${n}" aria-label="${n} з 5" title="${n}/5">★</button>`;
        })
        .join("");

    // задня сторона: довгий опис + інгредієнти (працює і якщо back відсутній)
    const longText = back?.long || "";
    const ingredientsList = Array.isArray(back?.ingredients) ? back.ingredients : [];
    const ingredientsHTML = ingredientsList.length
        ? `<ul class="menu-card__ul">${ingredientsList.map((p) => `<li>${p}</li>`).join("")}</ul>`
        : "";

    return `
  <div data-num="${itemId}" class="num menu-block" aria-label="${title}" role="button">
    <div class="menu-card__inner">
      <!-- FRONT -->
      <div class="menu-card__front">
        <div class="dish">
          <img height="130" src="img/photo/menu/${photo}.${typePhoto}" alt="${title}">
        </div>
        <div class="rating-stars" role="radiogroup" aria-label="Оцініть страву" data-title="${title}" data-dish-id="${id}">
          ${starsHTML}
        </div>
        <p class="dish-title">${title}</p>
<div class="menu-card__actions">
  <div class="price-chip">$${price}</div>

  <div class="menu-actions-right">
    <button class="share-btn" data-index="${itemId - 1}" aria-label="Поділитися «${title}»">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.5 2.5 0 0 0 0-1.39l7.05-4.11a2.5 2.5 0 1 0-.84-1.47L8.07 9.84a2.5 2.5 0 1 0 0 4.32l7.05 4.11c.41.91 1.33 1.55 2.38 1.55 1.5 0 2.72-1.22 2.72-2.72S19.5 16.08 18 16.08z"/>
      </svg>
    </button>

    <button class="button-shop-1 add-to-cart" data-index="${itemId - 1}" aria-label="Додати «${title}» у кошик">
      <svg class="cart-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor"
          d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0
           c-1.1 0-2 .9-2 2s.9 2 2 2
           2-.9 2-2-.9-2-2-2zM7.17 14h9.53c.83 0 1.55-.5
           1.85-1.26l2.38-5.59a1 1 0 0 0-.92-1.4H6.21
           L5.27 3H2v2h2.11l3.6 7.59
           -1.35 2.45A2 2 0 0 0 8 18h10v-2H8l1-2z"/>
      </svg>
    </button>
  </div>
</div>




      </div>

      <!-- BACK -->
       <div class="menu-card__back" aria-hidden="true">
        <h4>${title}</h4>
        ${grams || volume ? `<div class="weight-pill">${grams ? `${grams} g` : `${volume} ml`}</div>` : ""}
        ${longText ? `<p class="menu-card__long">${longText}</p>` : ""}
        ${ingredientsHTML}
        <div class="menu-card__price">
          <span class="price-chip">$${price}</span>
          <span class="menu-card__hint">Натисни, щоб повернути</span>
        </div>
      </div>
    </div>
  </div>`;
}

// Share dish (delegation on menu grid)
document.getElementById("menuParent")?.addEventListener("click", (e) => {
    const shareBtn = e.target.closest(".share-btn");
    if (!shareBtn) return;
    e.stopPropagation();

    const idx = +shareBtn.dataset.index;
    const dish = data?.dish?.[idx];
    if (!dish) return;

    shareDish(dish);
});
function shareDish(dish) {
    // грами тепер беремо з back.grams
    const grams = dish.back?.grams ? ` • ${dish.back.grams} г` : "";
    const desc  = dish.desc ? `\n${dish.desc}` : "";

    const url   = location.origin + location.pathname + "#menu";
    const text  = `Дивись страву в Tammy Food:\n${dish.title}${grams} — $${(+dish.price).toFixed(2)}${desc}\n${url}`;

    if (navigator.share) {
        navigator.share({
            title: dish.title,
            text,
            url
        }).catch(() => {
            // юзер міг відмінити – це ок
        });
    } else {
        navigator.clipboard?.writeText(text)
            .then(() => alert("Текст для поширення скопійовано ✨"))
            .catch(() => alert(text));
    }
}


function buildPaginator(totalPages) {
    const paginator = document.getElementById("paginator");
    paginator.innerHTML = "";
    for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const li = document.createElement("li");
        li.dataset.page = String(i);
        li.id = `page${pageNum}`;
        li.className = "waves-effect waves-circle page-item page-link";
        li.innerHTML = `<div class="page-link-text">${pageNum}</div>`;
        li.addEventListener("click", () => goToPage(pageNum));
        paginator.appendChild(li);
    }
}
function changePage(direction) {
    const current = main_page ? parseInt(main_page.id.replace("page", ""), 10) : 1;
    const count = div_num.length;
    const itemsPerPage = 8;
    const totalPages = Math.ceil(count / itemsPerPage);
    let newPage = current + direction;
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    goToPage(newPage);
}
function goToPage(pageNum) {
    main_page?.classList.remove("paginator_active");
    main_page = document.getElementById(`page${pageNum}`);
    main_page?.classList.add("paginator_active");

    const itemsPerPage = 8;
    const count = div_num.length;
    const startIndex = (pageNum - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, count);

    div_num.forEach((item, index) => {
        item.style.display = index >= startIndex && index < endIndex ? "flex" : "none";
    });
}

// Rating
function initRatings() {
    document.querySelectorAll(".rating-stars").forEach((group) => {
        const stars = group.querySelectorAll(".star");
        const title = group.dataset.title;
        const dishId = group.dataset.dishId ? Number(group.dataset.dishId) : null;

        const saved = JSON.parse(localStorage.getItem("ratings") || "{}")[title] || 0;
        if (saved) highlightStars(stars, saved);

        group.addEventListener("click", (e) => {
            const btn = e.target.closest(".star");
            if (!btn) return;
            e.stopPropagation();
            const value = +btn.dataset.value;
            highlightStars(stars, value);
            saveRating(title, value, dishId);
        });

        group.addEventListener("mouseover", (e) => {
            const btn = e.target.closest(".star");
            if (!btn) return;
            const value = +btn.dataset.value;
            highlightStars(stars, value);
        });

        group.addEventListener("mouseleave", () => {
            const ratings = JSON.parse(localStorage.getItem("ratings") || "{}");
            highlightStars(stars, ratings[title] || 0);
        });
    });
}

function saveRating(title, value, dishId) {
    // локальне збереження — як було
    const ratings = JSON.parse(localStorage.getItem("ratings") || "{}");
    ratings[title] = value;
    localStorage.setItem("ratings", JSON.stringify(ratings));

    // відправка в бекенд
    if (!dishId) return; // якщо чомусь немає id

    const userEmail = getCurrentUserEmail();
    const userHash =
        localStorage.getItem("userHash") ||
        (() => {
            const h = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem("userHash", h);
            return h;
        })();

    fetch(`${API_BASE}/api/dish-rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            dishId,
            rating: value,
            userEmail: userEmail || null,
            userHash
        })
    }).catch(() => {
        // якщо щось пішло не так – просто мовчки ігноруємо
    });
}

function highlightStars(stars, value) {
    stars.forEach((st) => st.classList.toggle("is-active", +st.dataset.value <= value));
}


/* ============================================================
   3) КОШИК
   ============================================================ */
// ===== Кошик =====
let cart = JSON.parse(localStorage.getItem("cart")) || [];

function uaInstrumental(noun) {
    const map = {
        "Лосось": "лососем",
        "Курка": "куркою",
        "Тунець": "тунцем",
        "Індичка": "індичкою",
        "Яловичина": "яловичиною",
        "Свинина": "свининою",
        "Креветки": "креветками",
        "Тофу": "тофу",
        "Квасоля": "квасолею",
        "Яйце": "яйцем",
        "Мідії": "мідіями",
        "Восьминіг": "восьминогом"
    };
    return map[noun] || noun.toLowerCase();
}

// dish: { id, title, price, image, description }
function addToCart(dish) {
    const existing = cart.find((item) => item.title === dish.title);

    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        cart.push({
            ...dish,
            quantity: 1
        });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartDisplay();
    updateCartModal(); // якщо модалка відкрита – одразу оновиться
}

function updateCartDisplay() {
    const count = cart.reduce((acc, item) => acc + (item.quantity || 0), 0);
    const badge = document.getElementById("cart-count");
    if (badge) badge.textContent = String(count);
}

function openCart() {
    const cartModal = document.getElementById("cart-modal");
    cartModal.classList.add("active");
    updateCartModal();
}

function closeCart() {
    const cartModal = document.getElementById("cart-modal");
    cartModal.classList.remove("active");
}

function updateCartModal() {
    const list = document.getElementById("cart-items");
    const counter = document.getElementById("cart-items-count");
    const subtotalEl = document.getElementById("cart-subtotal");
    const deliveryEl = document.getElementById("cart-delivery");
    const totalEl = document.getElementById("cart-total");

    list.innerHTML = "";

    if (!cart.length) {
        list.insertAdjacentHTML(
            "beforeend",
            `<li class="cart-empty">Ваш кошик порожній. Додайте щось смачненьке 😋</li>`
        );
        counter.textContent = "0 items";
        subtotalEl.textContent = "$0.00";
        deliveryEl.textContent = "$0.00";
        totalEl.textContent = "$0.00";
        return;
    }

    let subtotal = 0;
    const totalCount = cart.reduce((acc, i) => acc + (i.quantity || 0), 0);

    cart.forEach((item, index) => {
        const qty = item.quantity || 1;
        const unitPrice = parseFloat(item.price);
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        const imgSrc = item.image || "img/ingredients/dish-ready.png";

        list.insertAdjacentHTML(
            "beforeend",
            `
            <li class="cart-item">
                <div class="cart-thumb">
                    <img src="${imgSrc}" alt="${item.title}">
                </div>
                <div class="cart-main">
                    <div class="cart-title-row">
                        <h4 class="cart-item-title">${item.title}</h4>
                        <button class="cart-remove" onclick="removeItem(${index})" aria-label="Remove">×</button>
                    </div>
                    ${
                item.description
                    ? `<p class="cart-item-desc">${item.description}</p>`
                    : ""
            }
                    <div class="cart-bottom-row">
                        <div class="cart-price">
                            <span class="cart-price-each">$${unitPrice.toFixed(2)}</span>
                            <span class="cart-multiply">×</span>
                            <span class="cart-qty">${qty}</span>
                            <span class="cart-item-total">$${itemTotal.toFixed(2)}</span>
                        </div>
                        <div class="quantity-controls">
                            <button class="qty-btn" onclick="updateQuantity(${index}, -1)">−</button>
                            <span class="quantity">${qty}</span>
                            <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                        </div>
                    </div>
                </div>
            </li>
            `
        );
    });

    const delivery = 2.5; // просто фіксована доставка для краси
    const total = subtotal + delivery;

    counter.textContent = `${totalCount} item${totalCount === 1 ? "" : "s"}`;
    subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    deliveryEl.textContent = `$${delivery.toFixed(2)}`;
    totalEl.textContent = `$${total.toFixed(2)}`;
}

function updateQuantity(index, change) {
    const item = cart[index];
    if (!item) return;

    const next = (item.quantity || 1) + change;
    if (next > 0) {
        item.quantity = next;
    } else {
        cart.splice(index, 1);
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartModal();
    updateCartDisplay();
}

function removeItem(index) {
    cart.splice(index, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartModal();
    updateCartDisplay();
}

async function placeOrder() {
    if (!cart.length) {
        alert("Ваш кошик порожній!");
        return;
    }

    const userEmail = getCurrentUserEmail();

    const itemsPayload = cart.map((item) => {
        const qty = item.quantity || 1;
        const price = parseFloat(item.price) || 0;

        // якщо id — число → це блюдо з меню (dish_id)
        const dishId = typeof item.id === "number" ? item.id : null;

        // на майбутнє: якщо коли-небудь будеш зберігати builder_id, можна додати поле item.builderId
        const builderId = item.builderId || null;

        return {
            dishId,
            builderId,
            title: item.title,
            unitPrice: price,
            quantity: qty
        };
    });

    try {
        const resp = await fetch(`${API_BASE}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userEmail: userEmail || null,
                items: itemsPayload
            })
        });

        if (!resp.ok) {
            throw new Error("HTTP " + resp.status);
        }

        const data = await resp.json();

        alert(`Замовлення оформлено! №${data.orderId}, сума: $${data.total.toFixed(2)}`);

        cart = [];
        localStorage.setItem("cart", JSON.stringify(cart));
        updateCartModal();
        updateCartDisplay();
        closeCart();
    } catch (e) {
        console.error("Order error:", e);
        alert("Не вдалося оформити замовлення. Спробуйте ще раз пізніше.");
    }
}


// щоб працювали onclick у HTML
window.openCart = openCart;
window.closeCart = closeCart;
window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
window.placeOrder = placeOrder;
window.addToCart = addToCart;

// поруч з іншими addEventListener у “Builder”
// Делегування кліку по кнопці "Замовити"
document.addEventListener("click", (e) => {
    const btn = e.target.closest("#builderCheckout");
    if (!btn) return;

    const all = Object.values(picked).flat();
    if (!all.length) {
        alert("Додайте інгредієнти у конструктор 🤏");
        return;
    }

    const totals   = sumSelected(all);
    const baseName = picked.base[0]?.name || "Страва";
    const protInst = picked.protein[0]?.name ? uaInstrumental(picked.protein[0].name) : "";
    const orderName= protInst ? `${baseName} з ${protInst}` : baseName;

    const compositionText = all.map(x => x.name).join(", ");

    addToCart({
        id: `builder-${Date.now()}`,
        title: `Конструктор: ${orderName}`,
        price: totals.price.toFixed(2),
        image: "img/ingredients/dish-ready.png", // будь-яке гарне фото
        description: `Індивідуальна страва з конструктора. Склад: ${compositionText}.`
    });

    openCart();
});




/* ============================================================
   4) HOW IT WORKS: анімація ліній (без змін)
   ============================================================ */


/* ============================================================
   5) КОНСТРУКТОР ІНГРЕДІЄНТІВ + підказки
   ============================================================ */
let ingredients = {};
const ingredientList = document.getElementById("ingredient-list");

// === AI / API config (єдиний блок) ===
const API_BASE =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
        ? "http://localhost:3000"
        : ""; // прод: той самий домен

let aiEnabled = true; // оптимістично: не блокуємо UX

// health — лише індикатор, не «рубильник»
fetch(`${API_BASE}/api/health`)
    .then(r => r.json())
    .then(d => { aiEnabled = !!d.ai; updateTotalsAndPreview(); })
    .catch(() => { aiEnabled = true; updateTotalsAndPreview(); });

async function askBackend(picked, profile = {}) {
    const controller = new AbortController();
    const resp = await fetch(`${API_BASE}/api/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked, profile }),
        signal: controller.signal
    });
    if (!resp.ok) throw new Error("AI API error");
    return resp.json();
}



const picked = {
    base: [], protein: [], veggies: [],
    sauces: [], herbs: [], drinks: []
};

fetch("/api/ingredients")
    .then(res => res.json())
    .then(json => {
        ingredients = json.ingredients || {};
        const last = localStorage.getItem("lastCat") || "base";
        renderIngredients(ingredients[last] ? last : "base");

        const tabs = document.querySelectorAll(".category-tabs .tab");
        tabs.forEach(t => t.classList.toggle("active", t.dataset.cat === (ingredients[last] ? last : "base")));

        updateHints();
        updateTabCounters();
    })
    .catch(err => console.error("Помилка завантаження ingredients.json:", err));

document.querySelectorAll(".category-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelector(".category-tabs .tab.active")?.classList.remove("active");
        btn.classList.add("active");
        const cat = btn.dataset.cat;
        localStorage.setItem("lastCat", cat);
        renderIngredients(cat);
        updateTabCounters();
        updateCompositionUI();
        updateHints();
        updateTotalsAndPreview();
    });
});

function renderIngredients(cat) {
    if (!ingredientList || !ingredients[cat]) return;

    ingredientList.innerHTML = ingredients[cat].map(item => {
        const isSelected = picked[cat].some(x => x.name === item.name);
        return `
      <div class="ingredient-card${isSelected ? " selected" : ""}"
           data-cat="${cat}" data-name="${item.name}">
        <img src="img/ingredients/${item.photo}" alt="${item.name}">
        <p class="ingr-title">${item.name}</p>
        <div class="ingr-meta">
          <span class="ingr-price">$${item.price.toFixed(2)}</span>
          <span class="ingr-kcal">${item.kcal} kcal</span>
        </div>
        <span class="tick" aria-hidden="true">✓</span>
      </div>`;
    }).join("");

    ingredientList.querySelectorAll(".ingredient-card").forEach(card => {
        card.addEventListener("click", () => {
            const name = card.dataset.name;
            const c = card.dataset.cat;
            const item = ingredients[c].find(x => x.name === name);

            const arr = picked[c];
            const i = arr.findIndex(x => x.name === name);
            if (i === -1) arr.push(item); else arr.splice(i, 1);

            card.classList.toggle("selected");
            updateTabCounters();
            updateCompositionUI();
            updateHints();
            updateTotalsAndPreview();
        });
    });
}

// chips
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("chip")) {
        e.target.classList.toggle("active");
    }
});

// бейджі на табах
function updateTabCounters() {
    document.querySelectorAll(".category-tabs .tab").forEach(btn => {
        const cat = btn.dataset.cat;
        const n = picked[cat]?.length || 0;
        let badge = btn.querySelector(".tab-count");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "tab-count";
            btn.appendChild(badge);
        }
        badge.textContent = n ? String(n) : "";
        badge.style.display = n ? "inline-flex" : "none";
    });
}

// склад
function updateCompositionUI() {
    const ul = document.getElementById("compositionList");
    if (!ul) return;
    const flat = Object.entries(picked).flatMap(([cat, arr]) => arr.map(v => ({ cat, v })));
    ul.innerHTML = flat.map(x => `<li>${x.v.name}</li>`).join("");
}

// підсумки
function sumSelected(arr) {
    return arr.reduce((acc, x) => {
        acc.price += x.price || 0;
        acc.kcal += x.kcal || 0;
        acc.names.push(x.name);
        return acc;
    }, { price: 0, kcal: 0, names: [] });
}

// прев’ю + тотали (ASYNC) — ТІЛЬКИ AI
async function updateTotalsAndPreview() {
    const all = Object.values(picked).flat();
    const totals = sumSelected(all);

    const priceEl = document.getElementById("price");
    const calEl   = document.getElementById("calories");
    if (priceEl) priceEl.textContent = `$${totals.price.toFixed(2)}`;
    if (calEl)   calEl.textContent   = `${totals.kcal} kcal`;

    const preview = document.getElementById("dishPreview");
    if (!preview) return;

    // якщо нічого не вибрано — покажемо простий плейсхолдер і вийдемо
    if (!all.length) {
        preview.className = "preview-placeholder";
        preview.innerHTML = `
      <h3>Тут буде ваш рецепт приготування</h3>
      <p>Додайте інгредієнти — і AI складе опис та спосіб готування.</p>`;
        return;
    }

    // назва (для випадку, якщо AI не поверне name)
    const baseName = picked.base[0]?.name || "Страва";
    const protInst = picked.protein[0]?.name ? uaInstrumental(picked.protein[0].name) : "";
    const fallbackName = protInst ? `${baseName} з ${protInst}` : baseName;

    // якщо AI недоступний — можете або показати повідомлення, або легкий локальний текст (на твій вибір)



    // 🔄 лоадер-картка (без великого тексту, не «миготить»)
    preview.className = "";
    preview.innerHTML = `
    <div class="auto-recipe loading">
      <div class="method-badge shimmer" style="width:140px;height:24px;border-radius:12px;"></div>
      <div class="method-sub shimmer"   style="width:220px;height:14px;margin-top:6px;border-radius:7px;"></div>
      <h3 class="shimmer"               style="width:65%;height:28px;margin:12px 0;border-radius:8px;"></h3>
      <p  class="shimmer"               style="width:80%;height:14px;border-radius:7px;"></p>
      <p  class="shimmer"               style="width:90%;height:14px;margin-top:8px;border-radius:7px;"></p>
    </div>`;

    // запит до бекенду з таймаутом
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000); // 15с максимум

    try {
        const profile = JSON.parse(localStorage.getItem("tasteProfile") || "{}");
        const email = getCurrentUserEmail();

        const r = await fetch(`${API_BASE}/api/recipe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ picked, profile, userEmail: email || null }),
            signal: controller.signal
        }).then(x => {
            if (!x.ok) throw new Error("AI API error");
            return x.json();
        });


        const METHOD_ICON = {
            "Пательня": "🍳",
            "Духовка": "🔥",
            "Гриль":   "🥩",
            "Вок":     "🥢",
            "Вок/Пательня": "🥢",
            "Варіння": "🍲"
        };

        const icon    = METHOD_ICON[r.method] || "🍽️";
        const active  = Number(r.time_active)  || 0;
        const passive = Number(r.time_passive) || 0;
        const totalT  = (active + passive) || Number(r.time) || 0;
        const name    = r.name || fallbackName;
        const kcal    = r.kcal || totals.kcal;
        const story   = (r.story && r.story.length > 30) ? r.story : "Готово! Смачного. 😉";

        preview.innerHTML = `
      <div class="auto-recipe">
        <div class="method-badge"><i>${icon}</i>${r.method || "Пательня"}</div>
        <div class="method-sub">⌛ Час приготування: ~${totalT} хв</div>
        <h3>Від шефа: ${name}</h3>
        <p><b>Разом:</b> $${totals.price.toFixed(2)}, ${kcal} ккал</p>
        <p class="chef-story">${story}</p>
      </div>`;
    } catch (e) {
        // м’який фолбек, якщо AI не відповів
        preview.innerHTML = `
      <div class="auto-recipe">
        <h3>Від шефа: ${fallbackName}</h3>
        <p class="chef-story">Не вдалося отримати відповідь від AI. Спробуй ще раз трохи пізніше.</p>
      </div>`;
    } finally {
        clearTimeout(timer);
    }
}


/* ================== AI-підказка ================== */
async function askHint(picked){
    const resp = await fetch(`${API_BASE}/api/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked })
    });
    if (!resp.ok) throw new Error("AI hint error");
    return resp.json();
}


const aiHintEl = document.getElementById("aiHint");

function setHint(el, text, mode = "info") {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hint--ok", "hint--warn", "hint--info");
    el.classList.add(`hint--${mode}`);
    el.style.display = text ? "block" : "none";
}

// ─── AI hint із таймаутом і без залипання на "Підбираємо…" ───
const requestAiHint = debounce(async () => {
    if (!aiHintEl) return;

    const prevText =
        aiHintEl.textContent && aiHintEl.textContent !== "Підбираємо підказку…"
            ? aiHintEl.textContent
            : "";
    const prevMode =
        aiHintEl.classList.contains("hint--warn") ? "warn" :
            aiHintEl.classList.contains("hint--ok")   ? "ok"   : "info";

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000); // 4s

    try {
        aiHintEl.style.display = "block";
        aiHintEl.textContent = "Підбираємо підказку…";

        const email = getCurrentUserEmail();

        const resp = await fetch(`${API_BASE}/api/hint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ picked, userEmail: email || null }),
            signal: controller.signal
        });


        if (!resp.ok) throw new Error("AI hint error");
        const { hint } = await resp.json();

        if (hint) setHint(aiHintEl, hint, "info");
        else setHint(aiHintEl, prevText || "", prevMode);
    } catch {
        setHint(aiHintEl, prevText || "", prevMode);
    } finally {
        clearTimeout(t);
    }
}, 350);



function updateHints() {
    if (!aiHintEl) return;

    const hasBase   = picked.base.length > 0;
    const protN     = picked.protein.length;
    const hasVeg    = picked.veggies.length > 0 || picked.herbs.length > 0;
    const hasSauce  = picked.sauces.length > 0;
    const hasDrink  = picked.drinks.length > 0;

    if (![...Object.values(picked)].some(a => a.length)) {
        setHint(aiHintEl, "", "info");
        return;
    }
    if (!hasBase) {
        setHint(aiHintEl, "Додайте основу — рис, пасту чи кіноа, щоб стартувати.", "warn");
        return;
    }
    if (protN === 0) {
        setHint(aiHintEl, "Додайте 1–2 порції протеїну — курка, лосось, тофу тощо.", "info");
        return;
    }
    if (protN > 2) {
        setHint(aiHintEl, "Забагато протеїну — збалансуйте овочами або приберіть зайве.", "warn");
        return;
    }
    if (!hasVeg) {
        setHint(aiHintEl, "Додайте овоч або зелень для свіжості й хрумкості.", "info");
        // якщо вже є база+протеїн — можна звернутися до AI за додатковою порадою
        requestAiHint();
        return;
    }
    if (!hasSauce) {
        setHint(aiHintEl, "Додайте соус — він об’єднає смаки та дасть соковитість.", "info");
        requestAiHint();
        return;
    }
    if (!hasDrink){
        setHint(aiHintEl, "Для завершення додай напій у пару до страви.", "info");
        requestAiHint();
    }
    setHint(aiHintEl, "Чудово! Страва збалансована — можна зберігати рецепт.", "ok");
    requestAiHint();
}

/* Страва-сюрприз (ліва кнопка зверху, якщо є) */
document.getElementById('surpriseBtn')?.addEventListener('click', () => {
    const pickOne = arr => arr.length ? [arr[Math.floor(Math.random() * arr.length)]] : [];

    picked.base    = pickOne(ingredients.base || []);
    picked.protein = pickOne(ingredients.protein || []);
    picked.veggies = pickOne(ingredients.veggies || []);
    picked.drinks  = pickOne(ingredients.drinks || []);   // ← додаємо напій
    picked.sauces = []; picked.herbs = [];


    const active = document.querySelector('.category-tabs .tab.active')?.dataset.cat || 'base';
    renderIngredients(active);
    updateTabCounters();
    updateCompositionUI();
    updateHints();
    updateTotalsAndPreview();
});

/* Кнопка “🎲 Страва-сюрприз” справа у прев’ю */
/* Кнопка “🎲 Страва-сюрприз” справа у прев’ю */
const rndBtn = document.getElementById("randomDish");
const rndDice = rndBtn?.querySelector(".random-dice");

rndBtn?.addEventListener("click", async (e) => {
    if (!ingredients.base) return;

    // 🔄 анімація кубика
    if (rndDice) {
        rndBtn.classList.add("is-rolling");
        setTimeout(() => {
            rndBtn.classList.remove("is-rolling");
        }, 600);
    }

    rndBtn.classList.add("loading");
    rndBtn.disabled = true;

    // твоя логіка “страва-сюрприз” як була
    Object.keys(picked).forEach(k => picked[k] = []);
    const pick1 = arr => arr.length ? [arr[Math.floor(Math.random() * arr.length)]] : [];
    picked.base    = pick1(ingredients.base);
    picked.protein = pick1(ingredients.protein);
    picked.veggies = pick1(ingredients.veggies);
    picked.drinks  = pick1(ingredients.drinks);
    if (Math.random() < .6) picked.sauces = pick1(ingredients.sauces);
    if (Math.random() < .6) picked.herbs  = pick1(ingredients.herbs);

    const active = document.querySelector('.category-tabs .tab.active')?.dataset.cat || 'base';
    renderIngredients(active);
    updateTabCounters();
    updateCompositionUI();
    updateHints();

    await new Promise(r => setTimeout(r, 400));
    updateTotalsAndPreview();

    rndBtn.classList.remove("loading");
    rndBtn.disabled = false;
});


/* Навігація табів ← → */
(() => {
    const tabs = [...document.querySelectorAll(".category-tabs .tab")];
    if (!tabs.length) return;
    tabs.forEach((t, i) => {
        t.setAttribute("tabindex", "0");
        t.addEventListener("keydown", (e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const dir = e.key === "ArrowRight" ? 1 : -1;
            const next = (i + dir + tabs.length) % tabs.length;
            tabs[next].focus();
            tabs[next].click();
        });
    });
})();

/* Очистити */
document.getElementById("clearPicked")?.addEventListener("click", () => {
    Object.keys(picked).forEach(k => picked[k] = []);
    const active = localStorage.getItem("lastCat") || "base";
    renderIngredients(active);
    updateTabCounters();
    updateCompositionUI();
    updateHints();
    updateTotalsAndPreview();
});
/* ===== Збереження рецепта з конструктора у вподобання ===== */
/* ===== Збереження рецепта з конструктора у вподобання ===== */
/* ===== Збереження рецепта з конструктора у вподобання (MySQL + fallback) ===== */

// локальний fallback-ключ (на випадок, якщо бекенд недоступний)
const BUILDER_FAV_KEY = "builderFavorites_fallback";

// helpers тільки для резервного localStorage
function getBuilderFavoritesLocal() {
    try {
        return JSON.parse(localStorage.getItem(BUILDER_FAV_KEY) || "[]");
    } catch {
        return [];
    }
}
function saveBuilderFavoritesLocal(list) {
    localStorage.setItem(BUILDER_FAV_KEY, JSON.stringify(list.slice(0, 50)));
}

/** Отримати список збережених рецептів з бекенда або з localStorage (якщо помилка) */
async function fetchBuilderFavorites() {
    try {
        const resp = await fetch(`${API_BASE}/api/builder-recipes`);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        return data.recipes || [];
    } catch (err) {
        console.warn("Builder favorites: backend unavailable, using localStorage", err);
        return getBuilderFavoritesLocal();
    }
}

/** Рендер списку у вкладці "Вподобання" */
async function renderBuilderFavorites() {
    const box = document.getElementById("savedRecipesList");
    if (!box) return;

    const list = await fetchBuilderFavorites();

    if (!list.length) {
        box.innerHTML = `<div class="soft-note">
            Список порожній. Збережіть перший рецепт через конструктор ⭐
        </div>`;
        return;
    }

    box.innerHTML = list
        .map((r) => {
            const ingList = r.ingredients || [];
            const created = r.created_at
                ? new Date(r.created_at)
                : (r.ts ? new Date(r.ts) : null);

            const dateText = created
                ? created.toLocaleString()
                : "";

            return `
            <div class="saved-card">
                <div class="saved-top">
                    <b>${r.title}</b>
                    <span class="pill">${Number(r.price).toFixed(2)}$ • ${r.kcal || 0} ккал</span>
                </div>
                <div class="saved-meta">
                    <span>${ingList.length} інгредієнтів</span>
                    <span class="saved-date">${dateText}</span>
                </div>
                <div class="saved-ings">
                    ${ingList.join(", ")}
                </div>
            </div>`;
        })
        .join("");
}

/** Зберегти поточну страву з конструктора */
async function saveCurrentBuilderRecipe() {
    const all = Object.values(picked).flat();
    if (!all.length) {
        alert("Спочатку зберіть страву в конструкторі 🤏");
        return null;
    }

    const totals = sumSelected(all);

    const baseName = picked.base[0]?.name || "Страва з конструктора";
    const protInst = picked.protein[0]?.name
        ? uaInstrumental(picked.protein[0].name)
        : "";
    const title = protInst ? `${baseName} з ${protInst}` : baseName;

    const email = getCurrentUserEmail();

    const payload = {
        userEmail: email || null,
        title,
        price: +totals.price.toFixed(2),
        kcal: totals.kcal,
        ingredients: all.map((x) => x.name),
        ts: Date.now()
    };


    // анімація CTA-блоку (як було)
    const cta = document.getElementById("cta-builder");
    if (cta) {
        cta.classList.add("cta-builder--saved");
        setTimeout(() => cta.classList.remove("cta-builder--saved"), 700);
    }

    // спочатку пробуємо зберегти у MySQL
    try {
        const resp = await fetch(`${API_BASE}/api/builder-recipes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);

        const data = await resp.json();
        console.log("Builder recipe saved with id:", data.id);
    } catch (err) {
        console.warn("Builder recipe: backend error, saving to localStorage", err);
        const list = getBuilderFavoritesLocal();
        list.unshift({
            id: payload.ts,
            ...payload
        });
        saveBuilderFavoritesLocal(list);
    }

    alert("Рецепт додано у ваші вподобання ⭐");
    return payload;
}

/* кнопка в блоці CTA */
document.getElementById("saveRecipeBtn")?.addEventListener("click", async () => {
    const r = await saveCurrentBuilderRecipe();
    if (r) renderBuilderFavorites();
});

/* відрендерити список при завантаженні сторінки */
window.addEventListener("DOMContentLoaded", () => {
    renderBuilderFavorites();
});

/* ============================================================
   6) AI-CHEF форма (без змін логіки)
   ============================================================ */
const tasteForm = document.getElementById("tasteForm");
if (tasteForm) {
    tasteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const payload = {
            diet: form.diet.value,
            cuisines: collectChips(form.querySelector('[data-name="cuisines"]')),
            budget: form.budget.value || null,
            time: form.time.value || null,
            sliders: {
                spicy: +form.spicy.value,
                sweet: +form.sweet.value,
                salty: +form.salty.value,
                sour: +form.sour.value,
            },
            allergens: form.allergens.value.trim(),
            notes: form.freeText.value.trim(),
            gear: collectChips(form.querySelector('[data-name="gear"]')),
        };

        const box = document.getElementById("aiResult");
        if (box) {
            box.classList.add("loading");
            box.innerHTML = `<div class="loader"></div>`;
        }

        try {
            const recipe = await sendToAI(payload);
            renderRecipe(recipe);
        } finally {
            box?.classList.remove("loading");
        }
    });
}


// збереження профілю
document.getElementById("saveProfile")?.addEventListener("click", async () => {
    const form = document.getElementById("tasteForm");
    const data = Object.fromEntries(new FormData(form).entries());
    data.cuisines = collectChips(form.querySelector('[data-name="cuisines"]'));
    data.gear = collectChips(form.querySelector('[data-name="gear"]'));

    // 1) localStorage — як було
    localStorage.setItem("tasteProfile", JSON.stringify(data));

    // 2) якщо юзер залогінений — шлемо в MySQL
    const email = getCurrentUserEmail();
    if (email) {
        try {
            await fetch(`${API_BASE}/api/taste-profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userEmail: email, profile: data })
            });
        } catch (e) {
            console.warn("Taste-profile DB save failed:", e);
        }
    }

    alert("Профіль збережено ✅");
});


// автозаповнення
window.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("tasteForm");
    if (!form) return;

    function applyProfileToForm(data) {
        if (!data) return;

        // 1) Звичайні поля форми
        for (const [k, v] of Object.entries(data)) {
            const el = form.elements[k];
            if (!el) continue;
            if (
                el.tagName === "INPUT" ||
                el.tagName === "SELECT" ||
                el.tagName === "TEXTAREA"
            ) {
                el.value = v;
            }
        }

        // 2) Чіпси "cuisines"
        const cuisinesRoot = form.querySelector('[data-name="cuisines"]');
        if (cuisinesRoot) {
            cuisinesRoot
                .querySelectorAll(".chip")
                .forEach((ch) => ch.classList.remove("active"));

            (data.cuisines || []).forEach((txt) => {
                [...cuisinesRoot.querySelectorAll(".chip")].forEach((ch) => {
                    if (ch.textContent.trim() === txt) {
                        ch.classList.add("active");
                    }
                });
            });
        }

        // 3) Чіпси "gear"
        const gearRoot = form.querySelector('[data-name="gear"]');
        if (gearRoot) {
            gearRoot
                .querySelectorAll(".chip")
                .forEach((ch) => ch.classList.remove("active"));

            (data.gear || []).forEach((txt) => {
                [...gearRoot.querySelectorAll(".chip")].forEach((ch) => {
                    if (ch.textContent.trim() === txt) {
                        ch.classList.add("active");
                    }
                });
            });
        }

        // 4) Оновити шкали смаку через існуючу updateTasteUI
        ["spice", "sweet", "salt", "acid"].forEach((field) => {
            const hidden = document.getElementById(`taste-${field}`);
            const val = hidden ? Number(hidden.value || 1) : 1;
            updateTasteUI(field, val);
        });
    }

    // 1) Локальний профіль з localStorage
    let localProfile = null;
    const raw = localStorage.getItem("tasteProfile");
    if (raw) {
        try {
            localProfile = JSON.parse(raw);
            applyProfileToForm(localProfile);
        } catch (e) {
            console.warn("Taste-profile local parse error:", e);
        }
    }

    // 2) Якщо юзер залогінений – підтягнути профіль з сервера і перекрити
    const email = getCurrentUserEmail();
    if (email) {
        try {
            const resp = await fetch(
                `${API_BASE}/api/taste-profile?email=${encodeURIComponent(email)}`
            );
            if (resp.ok) {
                const { profile } = await resp.json();
                if (profile) {
                    applyProfileToForm(profile);
                    // оновлюємо localStorage, щоб далі все було синхронно
                    localStorage.setItem("tasteProfile", JSON.stringify(profile));
                }
            }
        } catch (e) {
            console.warn("Taste-profile load failed:", e);
        }
    }
});


// мок-API для демонстрації
async function sendToAI(payload) {
    const isMedit = payload.cuisines.includes("Середземноморська");
    const name = isMedit
        ? "Салат табуле з квасолею"
        : "Болоньєзе з індички без глютену";

    return {
        name,
        summary: "Збалансована страва під твої вподобання: помірна солоність, низька солодкість, акцент на свіжій зелені.",
        time: payload.time || 25,
        difficulty: "Легка",
        kcal: 520,
        fitScore: 92,
        image: isMedit
            ? "img/photo/ai/ai-mediterranean.jpg"
            : "img/photo/ai/ai-bolognese.jpg", // можеш підставити свої картинки
        ingredients: [
            "Кіноа — 120 г",
            "Огірок — 1 шт",
            "Помідори чері — 8 шт",
            "Петрушка — пучок",
            "Оливкова олія — 2 ст. л.",
            "Лимонний сік — 1 ст. л.",
            "Сіль/перець — до смаку",
        ],
        steps: [
            "Промий кіноа, залий водою 1:2 та відвари 15 хв.",
            "Наріж овочі дрібним кубиком, зелень — дрібно.",
            "Змішай все з оливковою олією та лимонним соком, приправ.",
        ],
        explanation: "Уникнули можливих алергенів та зберегли легкість. Високий fitScore через відповідність слайдерам смаку.",
    };
}


function renderRecipe(r) {
    const box = document.getElementById("aiResult");
    if (!box) return;

    const profile = JSON.parse(localStorage.getItem("tasteProfile") || "{}");
    const allergens = (profile.allergens || "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

    const ingredientsHTML = (r.ingredients || [])
        .map((i) => {
            const isForbidden = allergens.some((a) => i.toLowerCase().includes(a));
            return `
        <li${isForbidden ? ' class="forbidden"' : ""}>
          ${isForbidden ? `<span class="badge-forbidden">🚫</span>` : ""}
          ${i}
          <button class="replace-btn" data-item="${i}">Замінити</button>
        </li>`;
        })
        .join("");

    const stepsHTML = (r.steps || [])
        .map((s) => `<li>${s}</li>`)
        .join("");

    const imgSrc = r.image || "img/photo/ai/ai-placeholder.jpg";

    box.innerHTML = `
      <div class="ai-chef__recipe">
        <div class="ai-chef__photo">
          <img src="${imgSrc}" alt="${r.name}">
        </div>

        <div class="ai-chef__body">
          <h3>${r.name}</h3>
          <p>${r.summary || ""}</p>

          <div class="ai-chef__meta">
            <span class="pill">~${r.time || 25} хв</span>
            <span class="pill">${r.difficulty || "Легка"}</span>
            <span class="pill">${r.kcal || "—"} ккал</span>
            <span class="pill">FitScore ${r.fitScore || 90}%</span>
          </div>

          <h4>Інгредієнти</h4>
          <ul class="ai-chef__ingredients">${ingredientsHTML}</ul>

          <h4>Кроки</h4>
          <ol class="ai-chef__steps">${stepsHTML}</ol>

          <div class="actions">
            <button class="btn btn-ghost" id="explainBtn">Поясни вибір</button>
            <button class="btn btn-ghost" id="saveTemplateBtn">Зберегти як шаблон</button>
            <button class="btn btn-primary">Додати інгредієнти в кошик</button>
          </div>

          <div class="rating">
            <p>Оціни результат:</p>
            ${[1,2,3,4,5].map((n) => `<span class="star" data-value="${n}">★</span>`).join("")}
          </div>
        </div>
      </div>
    `;

    // виділити алергени
    box.querySelectorAll(".badge-forbidden").forEach((el) => {
        el.parentElement.style.opacity = "0.65";
    });

    // кнопки «Замінити»
    box.querySelectorAll(".replace-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const alt = await suggestAlternatives(btn.dataset.item);
            alert(`Можна замінити "${btn.dataset.item}" на: ${alt.join(", ")}`);
        });
    });

    // пояснення / шаблон
    box.querySelector("#explainBtn")?.addEventListener("click", () => {
        alert(r.explanation || "Страва підібрана під твої вподобання та обмеження.");
    });

    box.querySelector("#saveTemplateBtn")?.addEventListener("click", () => {
        localStorage.setItem("aiTemplate", JSON.stringify(r));
        alert("Шаблон збережено 💾");
    });

    // рейтинг зірочками
    const stars = box.querySelectorAll(".rating .star");
    stars.forEach((star) => {
        star.addEventListener("click", (e) => {
            const val = +e.target.dataset.value;
            localStorage.setItem("lastRecipeRating", val);
            stars.forEach((s) => {
                s.classList.toggle("active", +s.dataset.value <= val);
            });
        });
    });
}


async function suggestAlternatives(item) {
    const base = item.toLowerCase();
    if (base.includes("сир")) return ["фета", "тофу", "веганський пармезан"];
    if (base.includes("курка")) return ["індичка", "сочевиця", "гриби"];
    return ["альтернатива 1", "альтернатива 2"];
}
/* ================== TASTE LEVELS (гострота/солодкість/солоність/кислинка) ================== */

// Тексти для підписів під шкалами
const TASTE_HINTS = {
    spice: [
        "Ніжно, майже без гостроти",
        "Легенька пікантність",
        "Відчутно гостро",
        "Для любителів вогнику",
        "Пекельно гостро 🌶️"
    ],
    sweet: [
        "Ледь відчутна солодкість",
        "Помірно солодко",
        "Як домашній десерт",
        "Дуже солодко",
        "Максимум солодкого 🍯"
    ],
    salt: [
        "Майже без солі",
        "Легко підсолено",
        "Класичний баланс солі",
        "Добре підсолено",
        "Дуже солоно 🧂"
    ],
    acid: [
        "М’яко, майже без кислинки",
        "Легка свіжість",
        "Відчутна кислинка",
        "Яскраво кисло",
        "Дуже кисло, як лимон 🍋"
    ]
};

/**
 * Оновлює UI для однієї шкали:
 *  - активну крапку
 *  - прихований інпут
 *  - підпис-пояснення під шкалою
 */
function updateTasteUI(field, value) {
    const scale = document.querySelector(`.taste-scale[data-field="${field}"]`);
    if (!scale) return;

    const dots = scale.querySelectorAll(".taste-dot");
    dots.forEach(dot => {
        dot.classList.toggle("is-active", +dot.dataset.value === value);
    });

    const hidden = document.getElementById(`taste-${field}`);
    if (hidden) hidden.value = String(value);

    const hint = document.querySelector(`.taste-hint[data-for="${field}"]`);
    if (hint) {
        const list = TASTE_HINTS[field];
        hint.textContent = list?.[value - 1] || "";
    }
}

// Делегування кліку по крапках taste-dot
document.addEventListener("click", (e) => {
    const dot = e.target.closest(".taste-dot");
    if (!dot) return;

    const scale = dot.closest(".taste-scale");
    if (!scale) return;

    const field = scale.dataset.field;   // spice | sweet | salt | acid
    const value = +dot.dataset.value || 1;

    updateTasteUI(field, value);
});

// Ініціалізація значень при завантаженні сторінки / автозаповненні профілю
window.addEventListener("DOMContentLoaded", () => {
    ["spice", "sweet", "salt", "acid"].forEach((field) => {
        const hidden = document.getElementById(`taste-${field}`);
        const val = hidden ? Number(hidden.value || 1) : 1;
        updateTasteUI(field, val);
    });
});

/* ============================================================
   7) Footer: Email → Telegram (демо, без змін)
   ============================================================ */
/* ============================================================
   7) Footer: Email → Telegram + MySQL
   ============================================================ */
async function sendEmail() {
    const inputEl  = document.getElementById("emailData");
    const dataInput = inputEl.value.trim();

    const regexExp = /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i;
    const isMail = regexExp.test(dataInput);

    const config = {
        telegram: {
            token: "6389864163:AAGORCaDM7iTxC3Wiw6BTsCJrrsCPZc_mu4",
            chat: "@TammyFood"
        }
    };

    const btn = document.querySelector(".base-plane");

    if (!isMail) {
        alert("Неправильна адреса");
        return;
    }

    // анімація польоту
    if (btn && !btn.classList.contains("fly")) {
        btn.classList.add("fly");
        setTimeout(() => {
            btn.classList.remove("fly");
        }, 700);
    }

    // 1) Зберігаємо E-mail у MySQL
    try {
        const resp = await fetch(`${API_BASE}/api/newsletter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: dataInput })
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        console.log("Newsletter: email saved to DB");
    } catch (e) {
        console.warn("Newsletter DB save failed:", e);
    }

    // 2) Надсилаємо в Telegram (як і було)
    fetch(
        `https://api.telegram.org/bot${config.telegram.token}/sendMessage` +
        `?chat_id=${config.telegram.chat}&parse_mode=html&text=${encodeURIComponent(
            dataInput
        )}`
    )
        .then((r) => r.json())
        .then((d) => console.log("Telegram result:", d))
        .catch((e) => console.error(e));

    alert("Дякуємо за підписку! ✉️");
    inputEl.value = "";
}

window.sendEmail = sendEmail;

/* ============================================================
   8) USER PANEL (off-canvas): toggle, auth mock, tabs, prefs
/* ============================================================
   8) USER PANEL (off-canvas) + реальний бекенд авторизації
   ============================================================ */
(() => {
    const btnToggle = document.getElementById("userToggle");
    const panel     = document.getElementById("userPanel");
    const scrim     = document.getElementById("scrim");
    const btnClose  = document.getElementById("userClose");

    if (!panel || !btnToggle || !scrim || !btnClose) return;

    const headerBtn     = btnToggle;
    const headerInitial = document.querySelector(".user-initial");

    const $    = (sel, root = panel) => root.querySelector(sel);
    const $all = (sel, root = panel) => [...root.querySelectorAll(sel)];

    const focusablesSel = [
        'a[href]','area[href]','input:not([disabled])','select:not([disabled])',
        'textarea:not([disabled])','button:not([disabled])','iframe',
        '[tabindex]:not([tabindex="-1"])','[contenteditable="true"]'
    ].join(',');

    const API_BASE = "/api";

    let lastFocus = null;

    function trapFocus(e) {
        if (!panel.classList.contains("is-open")) return;
        if (e.key !== "Tab") return;
        const f = $all(focusablesSel, panel).filter(el => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
        }
    }

    function lockScroll(lock) {
        document.documentElement.style.overflow = lock ? "hidden" : "";
        document.body.style.overflow = lock ? "hidden" : "";
    }

    function setAria(open) {
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        btnToggle.setAttribute("aria-expanded", open ? "true" : "false");
        scrim.hidden = !open;
    }

    function openPanel() {
        if (panel.classList.contains("is-open")) return;
        lastFocus = document.activeElement;
        panel.classList.add("is-open");
        scrim.hidden = false;
        lockScroll(true);
        setAria(true);
        const first = panel.querySelector(focusablesSel) || btnClose;
        setTimeout(() => first?.focus(), 0);
    }

    function closePanel() {
        if (!panel.classList.contains("is-open")) return;
        panel.classList.remove("is-open");
        lockScroll(false);
        setAria(false);
        scrim.hidden = true;
        lastFocus?.focus?.();
    }

    btnToggle.addEventListener("click", (e) => {
        e.preventDefault();
        panel.classList.contains("is-open") ? closePanel() : openPanel();
    });
    btnClose.addEventListener("click", closePanel);
    scrim.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panel.classList.contains("is-open")) {
            e.preventDefault(); closePanel();
        } else if (e.key === "Tab") {
            trapFocus(e);
        }
    });

    // ======= DOM для auth =======
    const guestView   = $("#guestView");
    const userView    = $("#userView");
    const nameField   = $('[data-field="name"]');
    const emailField  = $('[data-field="email"]');
    const avatarInit  = $(".user-avatar__initial");
    const userNameEl  = $(".user-name");
    const userEmailEl = $(".user-email");

    const btnShowLogin   = $("#btnShowLogin");
    const btnShowSignup  = $("#btnShowSignup");
    const guestActions   = $("#guestActions");
    const guestNote      = $("#guestNote");
    const guestForms     = $("#guestForms");

    const loginForm   = $("#formLogin");
    const signupForm  = $("#formSignup");
    const loginError  = $("#loginError");
    const signupError = $("#signupError");

    // ======= Зберігання у localStorage (для фронта) =======
    function read(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
        catch { return fallback; }
    }
    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // ---- auth в localStorage: user + token ----
    function getAuth() {
        const token = localStorage.getItem("authToken") || null;
        const user  = read("authUser", null);
        if (!token || !user) return null;
        return { token, user };
    }
    function getToken() {
        return getAuth()?.token || null;
    }
    function getCurrentUser() {
        return getAuth()?.user || null;
    }
    function setAuth(user, token) {
        if (user && token) {
            localStorage.setItem("authToken", token);
            write("authUser", user);
        } else {
            localStorage.removeItem("authToken");
            localStorage.removeItem("authUser");
        }
        renderAuth();
    }

    function initials(n = "") {
        const t = n.trim();
        if (!t) return "U";
        return t.split(/\s+/).map(s => s[0]?.toUpperCase()).slice(0,2).join("") || "U";
    }

    // ======= Запит до бекенду з токеном =======
    async function api(path, options = {}) {
        const token = getToken();
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };
        if (token) {
            headers.Authorization = "Bearer " + token;
        }
        const res = await fetch(API_BASE + path, {
            ...options,
            headers
        });
        let data = {};
        try { data = await res.json(); } catch {}
        if (!res.ok) {
            const msg = data.error || "Сталася помилка.";
            throw new Error(msg);
        }
        return data;
    }

    // ======= Рендер авторизації =======
    function renderAuth() {
        const u = getCurrentUser();
        const isAuth = !!u;

        guestView.hidden = isAuth;
        userView.hidden  = !isAuth;

        if (isAuth) {
            const name  = u.name || "Користувач";
            const email = u.email || "email@example.com";

            nameField.textContent  = name;
            emailField.textContent = email;
            userNameEl.textContent = name;
            userEmailEl.textContent= email;

            const init = initials(name);
            avatarInit.textContent = init;
            if (headerInitial) {
                headerInitial.textContent = init;
                headerInitial.hidden = false;
            }
            headerBtn.classList.add("is-auth");
            headerBtn.title = name;

            // Підтягуємо дані з бекенду
            renderFavorites();
            renderOrders();
            renderPoints();
        } else {
            userNameEl.textContent  = "Гість";
            userEmailEl.textContent = "Ви не ввійшли";
            avatarInit.textContent  = "U";
            if (headerInitial) headerInitial.hidden = true;
            headerBtn.classList.remove("is-auth");
            headerBtn.title = "Гість";
        }
    }

    // ======= Перемикач логін/реєстрація (2 кроки) =======
    function switchAuthMode(mode) {
        if (!guestForms) return;

        guestForms.hidden = false;
        guestActions?.classList.add("is-collapsed");

        panel.classList.remove("auth-mode-login", "auth-mode-signup");
        panel.classList.add(mode === "login" ? "auth-mode-login" : "auth-mode-signup");

        guestNote.textContent = mode === "login"
            ? "Введіть email та пароль, щоб увійти."
            : "Заповніть поля, щоб створити акаунт.";

        loginForm.hidden  = mode !== "login";
        signupForm.hidden = mode !== "signup";

        if (loginError)  loginError.textContent  = "";
        if (signupError) signupError.textContent = "";

        btnShowLogin?.classList.toggle("is-selected", mode === "login");
        btnShowSignup?.classList.toggle("is-selected", mode === "signup");

        // злегка прокрутимо панель наверх до форм
        panel.scrollTo({ top: guestForms.offsetTop - 40, behavior: "smooth" });
    }

    // ======= Перевірка email / пароля =======
    function isValidEmailBasic(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    function isValidEmail(email) {
        const e = String(email).trim().toLowerCase();
        if (!isValidEmailBasic(e)) return false;

        const typos = ["@gma.com","@gmial.com","@gmal.com","@gmaill.com"];
        if (typos.some(t => e.endsWith(t))) return false;

        return true;
    }
    function emailTypoHint(email) {
        const e = String(email).trim().toLowerCase();
        if (e.endsWith("@gma.com")) return "Можливо, ви мали на увазі @gmail.com?";
        return "Некоректний email.";
    }
    function isValidPassword(pw) {
        return typeof pw === "string" && pw.length >= 8;
    }

    // ======= Показ / приховування пароля =======
    $all(".password-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const field = btn.closest(".password-field");
            const input = field?.querySelector("input");
            if (!input) return;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.classList.toggle("is-active", show);
            btn.setAttribute("aria-label", show ? "Сховати пароль" : "Показати пароль");
        });
    });

    // ======= Login (через /api/auth/login) =======
    loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!loginError) return;
        loginError.textContent = "";

        const fd = new FormData(loginForm);
        const email = String(fd.get("email") || "").trim();
        const password = String(fd.get("password") || "");

        if (!isValidEmail(email)) {
            loginError.textContent = emailTypoHint(email);
            return;
        }
        if (!isValidPassword(password)) {
            loginError.textContent = "Пароль має містити мінімум 8 символів.";
            return;
        }

        try {
            const data = await api("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });
            setAuth(data.user, data.token);
            closePanel();
        } catch (err) {
            loginError.textContent = err.message;
        }
    });

    // ======= Signup (через /api/auth/signup) =======
    signupForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!signupError) return;
        signupError.textContent = "";

        const fd = new FormData(signupForm);
        const name  = String(fd.get("name") || "Користувач").trim();
        const email = String(fd.get("email") || "").trim();
        const password = String(fd.get("password") || "");

        if (!name) {
            signupError.textContent = "Вкажіть ім’я.";
            return;
        }
        if (!isValidEmail(email)) {
            signupError.textContent = emailTypoHint(email);
            return;
        }
        if (!isValidPassword(password)) {
            signupError.textContent = "Пароль має містити мінімум 8 символів.";
            return;
        }

        try {
            const data = await api("/auth/signup", {
                method: "POST",
                body: JSON.stringify({ name, email, password })
            });
            setAuth(data.user, data.token);
            closePanel();
        } catch (err) {
            signupError.textContent = err.message;
        }
    });

    // ======= Logout =======
    $("#btnLogout")?.addEventListener("click", () => {
        setAuth(null, null);
    });

    // ======= Tabs =======
    const tabBtns = $all(".user-tabs .tab");
    const panels  = $all(".tab-panels .panel");

    function showTab(key) {
        tabBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tab === key));
        panels.forEach(p => p.toggleAttribute("hidden", p.dataset.panel !== key));
    }
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => showTab(btn.dataset.tab));
    });

    // ======= Рендер списку вподобань з бекенду =======
    async function renderFavorites() {
        const user = getCurrentUser();
        const box  = $("#savedRecipesList");
        if (!box) return;
        box.innerHTML = "";
        if (!user) {
            box.innerHTML = '<p class="soft-note">Щоб бачити вподобання, увійдіть у акаунт.</p>';
            $("#profileFavCount") && ($("#profileFavCount").textContent = "0");
            return;
        }

        try {
            const rows = await api("/user/favorites");
            $("#profileFavCount") && ($("#profileFavCount").textContent = rows.length);

            if (!rows.length) {
                box.innerHTML = '<p class="soft-note">Список порожній. Збережіть перший рецепт через конструктор ⭐</p>';
                return;
            }

            rows.forEach(r => {
                let ings = [];
                try {
                    ings = Array.isArray(r.ingredients)
                        ? r.ingredients
                        : JSON.parse(r.ingredients || "[]");
                } catch { ings = []; }

                const card = document.createElement("div");
                card.className = "saved-card";
                card.innerHTML = `
                    <div class="saved-top">
                        <div class="saved-title">${r.title}</div>
                        <div class="saved-date">${new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div class="saved-meta">
                        <span>${Number(r.total_price || 0).toFixed(2)} ₴</span>
                        <span>${r.total_kcal} ккал</span>
                    </div>
                    <div class="saved-ings">${ings.join(", ")}</div>
                `;
                box.appendChild(card);
            });
        } catch (err) {
            box.innerHTML = `<p class="soft-note">Помилка завантаження вподобань: ${err.message}</p>`;
        }
    }

    // ======= Рендер замовлень з бекенду =======
    async function renderOrders() {
        const user = getCurrentUser();
        const box  = $("#ordersList");
        if (!box) return;
        box.innerHTML = "";

        if (!user) {
            box.innerHTML = '<p class="soft-note">Увійдіть, щоб бачити свої замовлення.</p>';
            return;
        }

        try {
            const rows = await api("/user/orders");
            $("#profileOrderCount") && ($("#profileOrderCount").textContent = rows.length);
            // масив
            if (!rows.length) {
                box.innerHTML = '<p class="soft-note">Поки що замовлень немає. Спробуйте оформити перше замовлення 🍽️</p>';
                return;
            }

            rows.forEach(o => {
                const card = document.createElement("div");
                card.className = "saved-card";
                card.innerHTML = `
                    <div class="saved-top">
                        <div class="saved-title">Замовлення #${o.id}</div>
                        <div class="saved-date">${new Date(o.created_at).toLocaleString()}</div>
                    </div>
                    <div class="saved-meta">
                        <span>Сума: ${Number(o.total_price || 0).toFixed(2)} ₴</span>
                        <span>Статус: ${o.status}</span>
                        <span>${o.items_count} позицій</span>
                    </div>
                `;
                box.appendChild(card);
            });
        } catch (err) {
            box.innerHTML = `<p class="soft-note">Помилка завантаження замовлень: ${err.message}</p>`;
        }
    }

    // ======= Рендер балів =======
    async function renderPoints() {
        const user = getCurrentUser();
        const badge      = $("#pointsBadge");
        const valueEl    = $("#pointsValue");
        const historyBox = $("#pointsHistory");
        const faqBox     = $("#pointsFaq");
        if (!badge || !valueEl || !historyBox) return;

        if (!user) {
            valueEl.textContent = "0";
            historyBox.innerHTML = '<p class="soft-note">Увійдіть або зареєструйтеся, щоб бачити свої бали.</p>';
            if (faqBox) faqBox.hidden = true;
            return;
        }

        // клік по бейджу — показ/приховати FAQ
        if (!badge.dataset.bindClick) {
            badge.dataset.bindClick = "1";
            badge.addEventListener("click", () => {
                if (!faqBox) return;
                const hidden = faqBox.hidden;
                faqBox.hidden = !hidden;
                faqBox.classList.toggle("points-faq--visible", !hidden);
            });
        }

        try {
            const data = await api("/user/points"); // { balance, history }

            valueEl.textContent = data.balance ?? 0;

            // короткий бейдж в профілі
            const brief = document.getElementById("profilePointsBrief");
            if (brief) {
                brief.textContent = data.balance ?? 0;
            }

            if (!data.history || !data.history.length) {
                historyBox.innerHTML = '<p class="soft-note">Історія балів поки порожня.</p>';
                return;
            }

            historyBox.innerHTML = "";
            data.history.forEach(h => {
                const row = document.createElement("div");
                row.className = "points-history-item";
                const sign = h.delta > 0 ? "+" : "";
                row.innerHTML = `
                <span>${sign}${h.delta} балів — ${h.reason}</span>
                <span>${new Date(h.created_at).toLocaleString()}</span>
            `;
                historyBox.appendChild(row);
            });
        } catch (err) {
            historyBox.innerHTML = `<p class="soft-note">Помилка завантаження балів: ${err.message}</p>`;
        }
    }


    // ======= Prefs & Settings =======
    const darkToggle  = document.getElementById("toggleDark");
    const newsToggle  = document.getElementById("toggleEmailNews");
    const btnClearDemo= document.getElementById("btnClearDemo");

    function applyTheme() {
        const t = localStorage.getItem("theme") || "light";
        document.documentElement.classList.toggle("theme-dark", t === "dark");
        if (darkToggle) darkToggle.checked = t === "dark";
    }
    darkToggle?.addEventListener("change", () => {
        localStorage.setItem("theme", darkToggle.checked ? "dark" : "light");
        applyTheme();
    });

    function loadSettings() {
        const s = read("userSettings", { emailNews:false });
        if (newsToggle) newsToggle.checked = !!s.emailNews;
    }
    newsToggle?.addEventListener("change", () => {
        write("userSettings", { emailNews: newsToggle.checked });
    });

    // Тепер кнопка чистить лише локальні дані (тему, кеш профілю)
    btnClearDemo?.addEventListener("click", () => {
        if (!confirm("Очистити локальні налаштування (тема, кеш профілю)?")) return;
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
        localStorage.removeItem("theme");
        localStorage.removeItem("userSettings");
        applyTheme();
        renderAuth();
        alert("Локальні дані очищено ✅");
    });

    // ======= Публічне API для конструктора =======
    window.tammyUser = {
        async addFavorite(recipe) {
            const user = getCurrentUser();
            if (!user) {
                alert("Спочатку увійдіть, щоб зберігати рецепти.");
                openPanel();
                return;
            }

            try {
                await api("/user/favorites", {
                    method: "POST",
                    body: JSON.stringify({
                        title     : recipe.title,
                        totalPrice: Number(recipe.totalPrice || 0),
                        totalKcal : Number(recipe.totalKcal || 0),
                        ingredients: recipe.ingredients || []
                    })
                });

                renderFavorites();
                renderPoints();
                alert("Рецепт збережено у вашому акаунті ✅");
            } catch (err) {
                alert("Не вдалося зберегти рецепт: " + err.message);
            }
        },

        async addOrder(orderPayload) {
            // orderPayload: { items: [...], totalPrice }
            if (!orderPayload || !Array.isArray(orderPayload.items) || !orderPayload.items.length) {
                alert("Кошик порожній.");
                return;
            }
            const user = getCurrentUser();

            try {
                const res = await fetch("/api/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userEmail: user?.email || null,
                        items    : orderPayload.items
                    })
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || "Помилка створення замовлення.");
                }

                renderOrders();
                renderPoints();
                alert(`Замовлення #${data.orderId} створено ✅`);
            } catch (err) {
                alert("Не вдалося оформити замовлення: " + err.message);
            }
        }
    };

    // ======= INIT =======
    applyTheme();
    loadSettings();
    renderAuth();
    const activeTab = panel.querySelector(".user-tabs .tab.is-active")?.dataset.tab || "profile";
    showTab(activeTab);
})();
