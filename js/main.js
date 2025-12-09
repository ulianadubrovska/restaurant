"use strict";

/* ============================================================
   0) ГЛОБАЛИ + УТИЛІТИ
   ============================================================ */
let data;
let div_num;
let main_page;
// === Tammy points global state ===
let currentUserEmail = null;      // оновлюється після /api/user/me
let currentPointsBalance = 0;     // реальний баланс з бекенду
let pointsToUse = 0;              // скільки користувач хоче списати
const DELIVERY_FEE = 0;         // повинно співпадати з бекендом

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
   1) MAIN / HERO / HEADER
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

// HERO: subtle pulsing button
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

// HERO: falling ingredients and dish reveal
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
   2) MENU: loading, rendering, pagination, rating
   ============================================================ */

fetch("/api/dishes")
    .then((response) => response.json())
    .then((json) => {
        data = json; // structure stays { dish: [...] }
        const menuBlock = document.getElementById("menuParent");
        const newArr = data.dish.map((item) => item);

        newArr.forEach((item, index) => {
            menuBlock.insertAdjacentHTML("beforeend", renderDishItem(item, index + 1));
        });

        // Flip animation
        menuBlock.addEventListener("click", (e) => {
            const btn = e.target.closest("button, a");
            if (btn) return;
            const card = e.target.closest(".menu-block");
            if (!card) return;
            card.classList.toggle("flipped");
        });

        // Add to cart buttons
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
                    unitPrice: Number(dish.price),
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


// ========== CARD TEMPLATE ==========
function renderDishItem(item, itemId) {
    const { id, title, price, stars, photo, typePhoto, back } = item;
    const grams  = back?.grams ?? null;
    const volume = back?.volume_ml ?? null;

    // rating (from localStorage)
    const saved = (JSON.parse(localStorage.getItem("ratings") || "{}"))[title] || 0;
    const starsHTML = [...Array(5)]
        .map((_, i) => {
            const n = i + 1;
            const active = n <= saved ? "is-active" : "";
            return `<button class="star ${active}" data-value="${n}" aria-label="${n} out of 5" title="${n}/5">★</button>`;
        })
        .join("");

    // Back side
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

        <div class="rating-stars" role="radiogroup" aria-label="Rate the dish" data-title="${title}" data-dish-id="${id}">
          ${starsHTML}
        </div>

        <p class="dish-title">${title}</p>

<div class="menu-card__actions">
  <div class="price-chip">$${price}</div>

  <div class="menu-actions-right">

    <button class="share-btn" data-index="${itemId - 1}" aria-label="Share «${title}»">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.5 2.5 0 0 0 0-1.39l7.05-4.11a2.5 2.5 0 1 0-.84-1.47L8.07 9.84a2.5 2.5 0 1 0 0 4.32l7.05 4.11c.41.91 1.33 1.55 2.38 1.55 1.5 0 2.72-1.22 2.72-2.72S19.5 16.08 18 16.08z"/>
      </svg>
    </button>

    <button class="button-shop-1 add-to-cart" data-index="${itemId - 1}" aria-label="Add «${title}» to cart">
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
          <span class="menu-card__hint">Tap to flip back</span>
        </div>
      </div>

    </div>
  </div>`;
}


// ======= SHARE FEATURE =======
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
    const grams = dish.back?.grams ? ` • ${dish.back.grams} g` : "";
    const desc  = dish.desc ? `\n${dish.desc}` : "";

    const url   = location.origin + location.pathname + "#menu";
    const text  = `Check out this dish on Tammy Food:\n${dish.title}${grams} — $${(+dish.price).toFixed(2)}${desc}\n${url}`;

    if (navigator.share) {
        navigator.share({
            title: dish.title,
            text,
            url
        }).catch(() => {});
    } else {
        navigator.clipboard?.writeText(text)
            .then(() => alert("Share text copied ✨"))
            .catch(() => alert(text));
    }
}


// ======= PAGINATOR =======
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


// ======= RATING =======
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
    const ratings = JSON.parse(localStorage.getItem("ratings") || "{}");
    ratings[title] = value;
    localStorage.setItem("ratings", JSON.stringify(ratings));

    if (!dishId) return;

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
    }).catch(() => {});
}

function highlightStars(stars, value) {
    stars.forEach((st) => st.classList.toggle("is-active", +st.dataset.value <= value));
}
/* ============================================================
   3) КОШИК
   ============================================================ */
// ===== Кошик =====
let cart = [];
loadCartFromStorage();

function getCartStorageKey() {
    const email = getCurrentUserEmail();
    return email ? `cart_${email}` : "cart_guest";
}

function loadCartFromStorage() {
    try {
        const key = getCartStorageKey();
        cart = JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
        cart = [];
    }
}

function saveCartToStorage() {
    const key = getCartStorageKey();
    localStorage.setItem(key, JSON.stringify(cart));
}
function loadCart() {
    // Підтягуємо кошик з localStorage для поточного юзера
    loadCartFromStorage();
    return cart;
}

function updateQuantity(idx, delta) {
    const item = cart[idx];
    if (!item) return;

    const newQty = (item.quantity || 1) + delta;

    if (newQty <= 0) {
        // видаляємо позицію, якщо кількість стає 0
        cart.splice(idx, 1);
    } else {
        item.quantity = newQty;
    }

    saveCartToStorage();
    updateCartDisplay();
    updateCartModal();
}

/**
 * Перерахує суми з урахуванням введених Tammy points
 * і оновить DOM (subtotal, delivery, discount, total)
 */
function updateCartTotals() {
    const inputEl = document.getElementById("cartPointsUse");
    const currentCart = loadCart();

    // рахуємо subtotal
    const subtotal = currentCart.reduce((s, c) => {
        const unit = Number(
            c.unitPrice !== undefined ? c.unitPrice : c.price || 0
        );
        const qty = Number(c.quantity || 1);
        return s + unit * qty;
    }, 0);
// доставки немає – працюємо тільки з сумою страв
    const totalBeforeDiscount = subtotal;

    const available = currentPointsBalance || 0;

    let raw = inputEl ? Number(inputEl.value) : 0;
    if (!isFinite(raw) || raw < 0) raw = 0;
    raw = Math.floor(raw);

    // не більше балансу
    if (raw > available) raw = available;
    // і не більше загальної суми
    if (raw > totalBeforeDiscount) raw = Math.floor(totalBeforeDiscount);

    pointsToUse = raw;
    if (inputEl) inputEl.value = String(pointsToUse);

    // тепер просто оновлюємо модалку з новими pointsToUse
    updateCartModal();
}

// допоміжне: корінь модалки кошика
function getCartRoot() {
    return document.getElementById("cart-modal");
}

// dish: { id, title, price | unitPrice, image, description }
function addToCart(dish) {
    // нормалізуємо ціну в одне поле
    const unitPrice = Number(
        dish.unitPrice !== undefined ? dish.unitPrice : dish.price || 0
    );

    const existing = cart.find((item) => item.title === dish.title);

    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        cart.push({
            ...dish,
            unitPrice,            // основна ціна за одиницю
            price: unitPrice,     // лишаємо для сумісності
            quantity: 1
        });
    }

    saveCartToStorage();
    updateCartDisplay();
    updateCartModal();
}

function updateCartDisplay() {
    const count = cart.reduce((acc, item) => acc + (item.quantity || 0), 0);
    const badge = document.getElementById("cart-count");
    if (badge) badge.textContent = String(count);
}

function openCart() {
    const cartModal = getCartRoot();
    if (!cartModal) return; // щоб не падало, якщо id не збігся
    // додаємо декілька класів, щоб попасти в будь-який варіант CSS
    cartModal.classList.add("active", "open", "is-open");
    updateCartModal();
}

function closeCart() {
    const cartModal = getCartRoot();
    if (!cartModal) return;
    cartModal.classList.remove("active", "open", "is-open");
}

function updateCartModal() {
    const listEl       = document.getElementById("cart-items");
    const subtotalEl   = document.getElementById("cart-subtotal");
    // у новому HTML може НЕ бути cart-delivery – це ок
    const deliveryEl   = document.getElementById("cart-delivery");
    const discountEl   = document.getElementById("cart-discount");
    const totalEl      = document.getElementById("cart-total");
    const countEl      = document.getElementById("cart-items-count");

    if (!listEl) return;

    listEl.innerHTML = "";
    let subtotal = 0;
    let count    = 0;

    if (!cart.length) {
        listEl.innerHTML = `<li class="cart-empty">
            Your cart is empty. Add something tasty 🍝
        </li>`;
    }

    cart.forEach((item, idx) => {
        const unit = Number(
            item.unitPrice !== undefined ? item.unitPrice : item.price || 0
        );
        const qty = Number(item.quantity || 1);
        const lineTotal = unit * qty;

        subtotal += lineTotal;
        count    += qty;
        const isAi = item.ai || String(item.id || "").startsWith("ai-");

        const isBuilderDish =
            item.isBuilder ||
            !!item.builderId ||
            String(item.id || "").startsWith("builder-") ||
            String(item.title || "").startsWith("Chef’s Custom Dish");

        const photoHtml = (!isBuilderDish && item.image)
            ? `<div class="cart-thumb"><img src="${item.image}" alt="${item.title}"></div>`
            : "";

        const builderIngredientsHtml =
            isBuilderDish && Array.isArray(item.ingredients) && item.ingredients.length
                ? `
        <p class="cart-builder-line"
           title="${item.ingredients.join(', ')}">
            <span class="cart-builder-label-text">Your ingredients:</span>
            ${item.ingredients.join(", ")}
        </p>`
                : "";



        const li = document.createElement("li");
        li.className =
            "cart-item" +
            ((isAi || !item.image || isBuilderDish) ? " no-photo" : "") +
            (isAi ? " ai-dish" : "");

        li.innerHTML = `
        ${photoHtml}
        <div class="cart-main">
            <div class="cart-title-row">
                <div class="cart-title-main">
         <h4 class="cart-item-title">${item.title}</h4>
${
            isBuilderDish
                ? `<span class="cart-builder-tag">BUILDER DISH</span>`
                : isAi
                    ? `<span class="cart-ai-tag">AI recipe</span>`
                    : ""
        }

                </div>
                <button class="cart-remove" data-idx="${idx}" aria-label="Remove item">×</button>
            </div>

${
            item.description && !isBuilderDish
                ? `<p class="cart-item-desc${isAi ? " cart-ai-desc" : ""}">${item.description}</p>`
                : ""
        }


            ${builderIngredientsHtml}

            <div class="cart-bottom-row">
                <div class="cart-price">
                    <span class="cart-price-each">$${unit.toFixed(2)}</span>
                    <span class="cart-multiply">×</span>
                    <span class="cart-qty">${qty}</span>
                    <span class="cart-item-total">$${lineTotal.toFixed(2)}</span>
                </div>

                <div class="quantity-controls">
                    <button class="qty-btn" data-idx="${idx}" data-delta="-1">−</button>
                    <span class="quantity">${qty}</span>
                    <button class="qty-btn" data-idx="${idx}" data-delta="1">+</button>
                </div>
            </div>
        </div>
    `;

        listEl.appendChild(li);
    });


    // клік по "×" — видалити
    listEl.querySelectorAll(".cart-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            if (isNaN(idx)) return;
            cart.splice(idx, 1);
            saveCartToStorage();
            updateCartDisplay();
            updateCartModal();
        });
    });

    // +/- кількість
    listEl.querySelectorAll(".qty-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const idx   = Number(e.currentTarget.dataset.idx);
            const delta = Number(e.currentTarget.dataset.delta || 0);
            if (isNaN(idx) || !delta) return;
            updateQuantity(idx, delta);
        });
    });

// доставки немає – рахуємо тільки страви
    const delivery = 0;
// доставки немає – рахуємо тільки страви
    const totalBeforeDiscount = subtotal;

// Tammy points
    const available = currentPointsBalance || 0;
    if (pointsToUse > available) pointsToUse = available;
    if (pointsToUse > totalBeforeDiscount) {
        pointsToUse = Math.floor(totalBeforeDiscount);
    }
    if (!cart.length) pointsToUse = 0;

    const discount   = pointsToUse;
    const finalTotal = Math.max(0, totalBeforeDiscount - discount);

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

// ховаємо рядок "Delivery", якщо він є в розмітці
    if (deliveryEl) {
        deliveryEl.textContent = "$0.00";
        const row = deliveryEl.closest(".cart-summary-row, li, tr");
        if (row) row.style.display = "none";
    }

    if (discountEl) discountEl.textContent = discount ? `-$${discount.toFixed(2)}` : "-$0.00";
    if (totalEl)    totalEl.textContent    = `$${finalTotal.toFixed(2)}`;

    if (countEl)    countEl.textContent    = `${count} items`;

    const balEl   = document.getElementById("cartPointsBalance");
    const useEl   = document.getElementById("cartPointsUse");
    const infoEl  = document.getElementById("cartPointsInfo");

    if (balEl) balEl.textContent = available;
    if (useEl) useEl.value       = pointsToUse;

    // підказка про те, скільки балів отримає
    const expectedPoints = Math.floor(subtotal / 10);
    if (infoEl) {
        if (!cart.length) {
            infoEl.textContent = "";
        } else if (!currentUserEmail) {
            infoEl.textContent =
                `Log in or create an account to earn approximately ${expectedPoints} Tammy points for this order.`;
        } else if (expectedPoints > 0) {
            infoEl.textContent =
                `You will earn approximately ${expectedPoints} Tammy points for this order.`;
        } else {
            infoEl.textContent =
                "Order total is too small to earn new points.";
        }
    }
}


// input «Use points»
document.getElementById("cartPointsUse")?.addEventListener("input", () => {
    updateCartTotals();
});

// кнопка «Use max»
document.getElementById("cartPointsMax")?.addEventListener("click", () => {
    const cart = loadCart();
    const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    const maxUse = Math.min(currentPointsBalance || 0, Math.floor(subtotal));
    const inputEl = document.getElementById("cartPointsUse");
    if (!inputEl) return;
    inputEl.value = String(maxUse);
    updateCartTotals();
});

// checkout – тепер як глобальна функція placeOrder(), бо в HTML onclick="placeOrder()"
async function placeOrder() {
    const userEmail = getCurrentUserEmail();
    const cart = loadCart();

    if (!cart.length) {
        alert("Your cart is empty.");
        return;
    }

    const body = {
        userEmail: userEmail || null,
        pointsToUse,
        items: cart.map((c) => ({
            dishId:    c.id || null,
            builderId: c.builderId || null,
            title:     c.title,
            unitPrice: c.unitPrice,
            quantity:  c.quantity,
        })),
    };

    try {
        const res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const json = await res.json();

        if (!json.ok) {
            alert("Order failed. Please try again.");
            return;
        }

        const earned = json.earnedPoints || 0;
        const used   = json.pointsUsed || 0;
        const newBal = json.pointsBalance ?? "";

        let msg = `Order placed successfully! 🎉\nYour order ID: #${json.orderId}\n\n`;
        if (used > 0)   msg += `Used ${used} points.\n`;
        if (earned > 0) msg += `Earned ${earned} new points.\n`;
        if (newBal !== "") msg += `Your new balance: ${newBal} points.\n`;

        alert(msg);

        // очищаємо кошик саме для поточного юзера
        localStorage.removeItem(getCartStorageKey());
        cart.length = 0; // чистимо in-memory
        pointsToUse = 0;
        updateCartDisplay();
        updateCartModal();
        closeCart();
    } catch (err) {
        console.error("Order error:", err);
        alert("An error occurred. Please try again later.");
    }
}



// Close cart
document.getElementById("cartClose")?.addEventListener("click", closeCart);

function uaInstrumental(word) {
    let w = (word || "").trim();
    if (!w) return "";

    // Якщо слово англійське – нічого не змінюємо.
    if (/[a-z]/i.test(w) && !/[а-яіїєґ]/i.test(w)) {
        return w;
    }

    const lower = w.toLowerCase();

    // Декілька ручних винятків (як у старій версії)
    const special = {
        "лосось": "лососем",
        "курка": "куркою",
        "індичка": "індичкою",
        "яловичина": "яловичиною",
        "свинина": "свининою",
        "креветки": "креветками",
        "квасоля": "квасолею",
        "тофу": "тофу",
    };
    if (special[lower]) {
        const res = special[lower];
        return w[0] === w[0].toUpperCase()
            ? res[0].toUpperCase() + res.slice(1)
            : res;
    }

    // Прості правила для укр. слів
    let res = lower;

    if (lower.endsWith("ка")) {
        res = lower.slice(0, -2) + "кою";
    } else if (lower.endsWith("а")) {
        res = lower.slice(0, -1) + "ою";
    } else if (lower.endsWith("я")) {
        res = lower.slice(0, -1) + "ею";
    } else if (lower.endsWith("ь")) {
        res = lower.slice(0, -1) + "ем";
    } else {
        res = lower + "ом";
    }

    return w[0] === w[0].toUpperCase()
        ? res[0].toUpperCase() + res.slice(1)
        : res;
}

/* ============================================================
   5) INGREDIENT BUILDER + HINTS
   ============================================================ */
let ingredients = {};
const ingredientList = document.getElementById("ingredient-list");

// 🔹 Нове:
let isBuilderBusy = false;
const MIN_INGR_FOR_RECIPE = 2;

function setBuilderBusy(flag) {
    isBuilderBusy = flag;
    const root = document.querySelector(".builder-section") || document.documentElement;
    if (root) {
        root.classList.toggle("builder-busy", flag);
    }

    // 🔹 блокуємо/розблоковуємо кнопку "Get recipe"
    const btn = document.getElementById("generateRecipeBtn");
    if (btn) {
        btn.disabled = flag;
        btn.classList.toggle("is-loading", flag);
    }
}


// === AI / API config (single block) ===
const API_BASE =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
        ? "http://localhost:3000"
        : ""; // prod: same origin

let aiEnabled = true; // optimistic – do not block UX

// health — only indicator, not a hard switch
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

// === State for AI recipe (to avoid spamming backend) ===
let lastRecipeSignature = null;
let lastRecipeRequestId = 0;

function buildRecipeSignature() {
    // беремо всі обрані інгредієнти з усіх категорій
    const names = Object.values(picked)
        .flat()
        .map(x => x.name)
        .filter(Boolean)
        .sort()
        .join("|");

    return names;
}


fetch("/api/ingredients")
    .then(res => res.json())
    .then(json => {
        ingredients = json.ingredients || {};
        const last = localStorage.getItem("lastCat") || "base";
        renderIngredients(ingredients[last] ? last : "base");

        const tabs = document.querySelectorAll(".category-tabs .tab");
        tabs.forEach(t =>
            t.classList.toggle("active", t.dataset.cat === (ingredients[last] ? last : "base"))
        );

        updateHints();
        updateTabCounters();
    })
    .catch(err => console.error("Ingredients load error:", err));

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
            // 🔹 Не даємо клікати по інгредієнтах, поки AI рахує
            if (isBuilderBusy) return;

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
            // 🔹 Тут ми НЕ хочемо постійно дзвонити в AI, тому лишаємо:
            updateTotalsAndPreview(); // це оновить тільки total + плейсхолдер
        });
    });

}

// chips
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("chip")) {
        e.target.classList.toggle("active");
    }
});

// badges on tabs
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

// composition list
function updateCompositionUI() {
    const ul = document.getElementById("compositionList");
    if (!ul) return;
    const flat = Object.entries(picked).flatMap(([cat, arr]) => arr.map(v => ({ cat, v })));
    ul.innerHTML = flat.map(x => `<li>${x.v.name}</li>`).join("");
}

// totals
function sumSelected(arr) {
    return arr.reduce((acc, x) => {
        acc.price += x.price || 0;
        acc.kcal += x.kcal || 0;
        acc.names.push(x.name);
        return acc;
    }, { price: 0, kcal: 0, names: [] });
}

// preview + totals (AI only when composition changes)
async function updateTotalsAndPreview(options = {}) {
    const { force = false } = options;

    const all    = Object.values(picked).flat();
    const totals = sumSelected(all);

    const priceEl = document.getElementById("price");
    const calEl   = document.getElementById("calories");
    if (priceEl) priceEl.textContent = `$${totals.price.toFixed(2)}`;
    if (calEl)   calEl.textContent   = `${totals.kcal} kcal`;

    const preview = document.getElementById("dishPreview");
    if (!preview) return;

    if (!all.length) {
        lastRecipeSignature = null;
        preview.className = "preview-placeholder";
        preview.innerHTML = `
          <h3>Your cooking recipe will appear here</h3>
          <p>Add ingredients — and AI will generate description and cooking steps.</p>`;
        return;
    }

    // 2) Менше ніж MIN_INGR_FOR_RECIPE → показати текст, але НЕ викликати AI
    if (all.length < MIN_INGR_FOR_RECIPE && !force) {
        lastRecipeSignature = null;
        preview.className = "preview-placeholder";
        preview.innerHTML = `
          <h3>Pick at least ${MIN_INGR_FOR_RECIPE} ingredients</h3>
          <p>Then press “Get recipe” and we’ll prepare cooking instructions for you.</p>`;
        return;
    }

    const newSignature = buildRecipeSignature();
    // Ми все одно зберігаємо сигнатуру, але НЕ блокуємо повторний виклик при force:true
    lastRecipeSignature = newSignature;

    if (!force) {
        // автоматичні оновлення (при кліку по інгредієнтах) – без звернення до AI
        return;
    }

    const currentReqId  = ++lastRecipeRequestId;

    const baseName = picked.base[0]?.name || "Dish";
    const protInst = picked.protein[0]?.name ? uaInstrumental(picked.protein[0].name) : "";
    const fallbackName = protInst ? `${baseName} with ${protInst}` : baseName;

    preview.className = "";
    preview.innerHTML = `
        <div class="auto-recipe loading">
          <div class="method-badge shimmer" style="width:140px;height:24px;border-radius:12px;"></div>
          <div class="method-sub shimmer"   style="width:220px;height:14px;margin-top:6px;border-radius:7px;"></div>
          <h3 class="shimmer"               style="width:65%;height:28px;margin:12px 0;border-radius:8px;"></h3>
          <p  class="shimmer"               style="width:80%;height:14px;border-radius:7px;"></p>
          <p  class="shimmer"               style="width:90%;height:14px;border-radius:7px;"></p>
        </div>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    setBuilderBusy(true);

    try {
        const profile = JSON.parse(localStorage.getItem("tasteProfile") || "{}");
        const email   = getCurrentUserEmail();

        const r = await fetch(`${API_BASE}/api/recipe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ picked, profile, userEmail: email || null }),
            signal: controller.signal
        }).then(x => {
            if (!x.ok) throw new Error("AI API error");
            return x.json();
        });

        if (currentReqId !== lastRecipeRequestId) {
            return;
        }

        const METHOD_ICON = {
            "Skillet": "🍳",
            "Oven": "🔥",
            "Grill": "🥩",
            "Wok": "🥢",
            "Boiling": "🍲"
        };

        const icon    = METHOD_ICON[r.method] || "🍽️";
        const active  = Number(r.time_active)  || 0;
        const passive = Number(r.time_passive) || 0;
        const totalT  = (active + passive) || Number(r.time) || 0;
        const name    = r.name || fallbackName;
        const kcal    = r.kcal || totals.kcal;
        const story   = (r.story && r.story.length > 30)
            ? r.story
            : "Done! Enjoy your meal. 😉";

        preview.innerHTML = `
  <div class="auto-recipe">
    <div class="method-badge"><i>${icon}</i>${r.method || "Skillet"}</div>
    <div class="method-sub">⌛ Approx cooking time: ~${totalT} min</div>
    <h3>From the chef: ${name}</h3>
    <p class="chef-story">${story}</p>
  </div>`;

    } catch (e) {
        if (currentReqId !== lastRecipeRequestId) return;

        preview.innerHTML = `
          <div class="auto-recipe">
            <h3>From the chef: ${fallbackName}</h3>
            <p class="chef-story">
              Could not get a response from AI. Please try again a bit later.
            </p>
          </div>`;
    } finally {
        clearTimeout(timer);
        // 🔹 ЯК БИ НЕ ЗАКІНЧИЛОСЬ – знімаємо блокування
        setBuilderBusy(false);
    }
}
document.getElementById("generateRecipeBtn")?.addEventListener("click", () => {
    const all = Object.values(picked).flat();

    if (all.length < MIN_INGR_FOR_RECIPE) {
        // показуємо нормальну підказку через aiHint + плейсхолдер, без alert
        updateHints();
        updateTotalsAndPreview(); // покаже текст "Pick at least 2 ingredients..." в прев’ю

        // невеликий "потрясти" aiHint, щоб привернути увагу
        if (aiHintEl) {
            aiHintEl.classList.add("hint--shake");
            setTimeout(() => aiHintEl.classList.remove("hint--shake"), 500);
        }
        return;
    }

    // свідомо просимо AI згенерувати рецепт
    updateTotalsAndPreview({ force: true });
});


/* ================== AI HINT ================== */
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

// AI hint with timeout and no stuck “loading…”
const requestAiHint = debounce(async () => {
    if (!aiHintEl) return;

    const prevText =
        aiHintEl.textContent && aiHintEl.textContent !== "Picking a tip for you…"
            ? aiHintEl.textContent
            : "";
    const prevMode =
        aiHintEl.classList.contains("hint--warn") ? "warn" :
            aiHintEl.classList.contains("hint--ok")   ? "ok"   : "info";

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);

    try {
        aiHintEl.style.display = "block";
        aiHintEl.textContent = "Picking a tip for you…";

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

    const totalCount = Object.values(picked)
        .reduce((s, arr) => s + arr.length, 0);

    // нічого не вибрано — ховаємо підказку
    if (!totalCount) {
        setHint(aiHintEl, "", "info");
        return;
    }

    if (!hasBase) {
        setHint(aiHintEl, "Add a base — rice, pasta or quinoa — to start.", "warn");
        return;
    }

    // 🔹 НОВЕ: правило про мінімум інгредієнтів тепер тут
    if (totalCount < MIN_INGR_FOR_RECIPE) {
        setHint(
            aiHintEl,
            `Pick at least ${MIN_INGR_FOR_RECIPE} ingredients, then press “Get recipe”.`,
            "info"
        );
        return;
    }

    if (protN === 0) {
        setHint(aiHintEl, "Add 1–2 portions of protein — chicken, salmon, tofu, etc.", "info");
        return;
    }
    if (protN > 2) {
        setHint(aiHintEl, "Too much protein — balance with veggies or remove the extra.", "warn");
        return;
    }
    if (!hasVeg) {
        setHint(aiHintEl, "Add some vegetables or fresh herbs for color and crunch.", "info");
        requestAiHint();
        return;
    }
    if (!hasSauce) {
        setHint(aiHintEl, "Add a sauce — it will tie all the flavours together.", "info");
        requestAiHint();
        return;
    }
    if (!hasDrink){
        setHint(aiHintEl, "To complete the set, pair your dish with a drink.", "info");
        requestAiHint();
        return;
    }
    setHint(aiHintEl, "Perfect! Your dish is balanced — you can save the recipe.", "ok");
    requestAiHint();
}



/* “🎲 Random dish” button on the preview */
const rndBtn = document.getElementById("randomDish");
const rndDice = rndBtn?.querySelector(".random-dice");

rndBtn?.addEventListener("click", async (e) => {
    if (!ingredients.base) return;

    if (rndDice) {
        rndBtn.classList.add("is-rolling");
        setTimeout(() => {
            rndBtn.classList.remove("is-rolling");
        }, 600);
    }

    rndBtn.classList.add("loading");
    rndBtn.disabled = true;

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
    updateTotalsAndPreview({ force: true });

    rndBtn.classList.remove("loading");
    rndBtn.disabled = false;
});

/* Tabs keyboard navigation ← → */
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

/* Clear all picked ingredients */
document.getElementById("clearPicked")?.addEventListener("click", () => {
    Object.keys(picked).forEach(k => picked[k] = []);
    const active = localStorage.getItem("lastCat") || "base";
    renderIngredients(active);
    updateTabCounters();
    updateCompositionUI();
    updateHints();
    updateTotalsAndPreview();
});

async function saveCurrentBuilderRecipe() {
    const all = Object.values(picked).flat();
    if (!all.length) {
        alert("First, build a dish in the builder 🤏");
        return null;
    }

    const totals = sumSelected(all);

    const baseName = picked.base[0]?.name || "Custom builder dish";
    const protInst = picked.protein[0]?.name
        ? uaInstrumental(picked.protein[0].name)
        : "";
    const title = protInst ? `${baseName} with ${protInst}` : baseName;

    const email = getCurrentUserEmail();

    const builderPayload = {
        userEmail: email || null,
        title,
        price: +totals.price.toFixed(2),
        kcal: totals.kcal,
        ingredients: all.map((x) => x.name),
        ts: Date.now()
    };

    const cta = document.getElementById("cta-builder");
    if (cta) {
        cta.classList.add("cta-builder--saved");
        setTimeout(() => cta.classList.remove("cta-builder--saved"), 700);
    }

    let savedId = null;

    try {
        const resp = await fetch(`${API_BASE}/api/builder-recipes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(builderPayload)
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);

        const data = await resp.json();
        console.log("Builder recipe saved with id:", data.id);
        savedId = data.id ?? null;
    } catch (err) {
        console.warn("Builder recipe: backend error", err);
    }

    return {
        title,
        totalPrice: +totals.price.toFixed(2),
        totalKcal: totals.kcal,
        ingredients: all.map((x) => x.name),
        builderId: savedId
    };
}

// Кнопка "Order" у конструкторі: зберегти рецепт + додати в кошик
// Кнопка "Order" у конструкторі: зберегти рецепт + додати в кошик
document.getElementById("builderCheckout")?.addEventListener("click", async () => {
    const recipe = await saveCurrentBuilderRecipe();
    if (!recipe) return;

    addToCart({
        id: recipe.builderId ? `builder-${recipe.builderId}` : `builder-${Date.now()}`,
        title: recipe.title,
        unitPrice: recipe.totalPrice,
        builderId: recipe.builderId || null,
        ingredients: recipe.ingredients || [],   // <–– ВАЖЛИВО
        isBuilder: true                          // (флаг, якщо хочеш)
    });

    openCart();
});


/* CTA button in builder block */
document.getElementById("saveRecipeBtn")?.addEventListener("click", async () => {
    const recipe = await saveCurrentBuilderRecipe();
    if (!recipe) return;

    if (window.tammyUser?.addFavorite) {
        await window.tammyUser.addFavorite(recipe);
        // alert is inside addFavorite
    } else {
        alert("Recipe added to your favourites ⭐");
    }
});


/* ============================================================
   6) AI-CHEF FORM (real AI)
   ============================================================ */
window.lastAiChefRecipe = null;
const tasteForm = document.getElementById("tasteForm");

if (tasteForm) {
    tasteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const payload = {
            diet: form.diet.value,
            cuisines: collectChips(form.querySelector('[data-name="cuisines"]')),
            budget: form.budget.value ? Number(form.budget.value) : null,
            time: form.time.value ? Number(form.time.value) : null,
            sliders: {
                spice: Number(form.spice.value || 1),
                sweet: Number(form.sweet.value || 1),
                salt:  Number(form.salt.value  || 1),
                acid:  Number(form.acid.value  || 1),
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

            // 🔹 запам’ятати останній AI-рецепт
            window.lastAiChefRecipe = { recipe, taste: payload };

            renderRecipe(recipe, { allergens: payload.allergens, taste: payload });
        } catch (err) {
            console.error("AI-chef error:", err);
            if (box) {
                box.innerHTML = `
                    <div class="ai-chef__error">
                        <h3>Oops, AI is overloaded 🤖</h3>
                        <p>Try again a little later.</p>
                    </div>`;
            }
        } finally {
            box?.classList.remove("loading");
        }
    });
}


/* Save taste profile */
/* Save taste profile + add last AI dish to favourites */
document.getElementById("saveProfile")?.addEventListener("click", async () => {
    const form = document.getElementById("tasteForm");
    if (!form) return;

    const data = Object.fromEntries(new FormData(form).entries());
    data.cuisines = collectChips(form.querySelector('[data-name="cuisines"]'));
    data.gear     = collectChips(form.querySelector('[data-name="gear"]'));

    // локально
    localStorage.setItem("tasteProfile", JSON.stringify(data));

    const email = getCurrentUserEmail();

    // відправляємо профіль у бекенд (як і було)
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

    // 🔹 якщо є остання AI-страва – додаємо її в Favourites
    const last = window.lastAiChefRecipe?.recipe;
    const taste = window.lastAiChefRecipe?.taste || {};

    if (last && window.tammyUser?.addFavorite) {
        // така ж логіка ціни, як у renderRecipe
        const budget = (typeof taste.budget === "number" && !Number.isNaN(taste.budget))
            ? taste.budget
            : null;
        const totalPrice =
            (typeof last.price === "number" && !Number.isNaN(last.price) && last.price > 0)
                ? last.price
                : (budget || 10);

        const favPayload = {
            title      : last.name || "AI chef dish",
            totalPrice : Number(totalPrice.toFixed(2)),
            totalKcal  : Number(last.kcal || 0),
            ingredients: Array.isArray(last.ingredients) ? last.ingredients : []
        };

        try {
            // всередині addFavorite уже є алерт і оновлення списків
            await window.tammyUser.addFavorite(favPayload);
        } catch (e) {
            console.warn("Failed to save AI recipe as favorite:", e);
            // у випадку фейлу хоча б покажемо, що профіль збережено
            alert("Profile saved ✅");
            return;
        }
    } else {
        // якщо рецепта ще немає – просто зберегли профіль
        alert("Profile saved ✅");
    }
});


/* Auto-fill profile */
window.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("tasteForm");
    if (!form) return;

    function applyProfileToForm(data) {
        if (!data) return;

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

        ["spice", "sweet", "salt", "acid"].forEach((field) => {
            const hidden = document.getElementById(`taste-${field}`);
            const val = hidden ? Number(hidden.value || 1) : 1;
            updateTasteUI(field, val);
        });
    }

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
                    localStorage.setItem("tasteProfile", JSON.stringify(profile));
                }
            }
        } catch (e) {
            console.warn("Taste-profile load failed:", e);
        }
    }
});

/* REAL AI-CHEF API */
async function sendToAI(tastePayload) {
    const email = getCurrentUserEmail();

    const resp = await fetch(`${API_BASE}/api/ai-chef`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            taste: tastePayload,
            userEmail: email || null,
        }),
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "AI-chef API error");
    }

    return resp.json();
}

function renderRecipe(r, context = {}) {
    const box = document.getElementById("aiResult");
    if (!box) return;
    const taste = context.taste || {};
    const budget = typeof taste.budget === "number" && !Number.isNaN(taste.budget)
        ? taste.budget
        : null;

    // якщо бекенд колись почне повертати r.price – візьмемо його;
    // інакше — бюджет або дефолт 10$
    const pricePerServing = (typeof r.price === "number" && !Number.isNaN(r.price) && r.price > 0)
        ? r.price
        : (budget || 10);

    let allergensStr = context.allergens ?? "";
    if (!allergensStr) {
        const profile = JSON.parse(localStorage.getItem("tasteProfile") || "{}");
        allergensStr = profile.allergens || "";
    }

    const allergens = allergensStr
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

    const ingredientsHTML = (r.ingredients || [])
        .map((i) => {
            const isForbidden = allergens.some((a) =>
                i.toLowerCase().includes(a)
            );
            return `
      <li${isForbidden ? ' class="forbidden"' : ""}>
        ${isForbidden ? `<span class="badge-forbidden">🚫</span>` : ""}
        <span class="ing-text">${i}</span>
        <button class="replace-btn" data-item="${i}">Replace</button>
      </li>`;
        })
        .join("");


    box.innerHTML = `
      <div class="ai-chef__recipe">
        <div class="ai-chef__body">
          <h3>${r.name}</h3>
          <p>${r.summary || ""}</p>

<div class="ai-chef__meta">
  <span class="pill">~${r.time || 25} min</span>
  <span class="pill">${r.difficulty || "Easy"}</span>
  <span class="pill">${r.kcal || "—"} kcal</span>
  <span class="pill">FitScore ${r.fitScore || 90}%</span>
  ${pricePerServing ? `<span class="pill">≈ $${pricePerServing.toFixed(2)} / serving</span>` : ""}
</div>


          <h4>Ingredients</h4>
          <ul class="ai-chef__ingredients">${ingredientsHTML}</ul>

          <div class="actions">
            <button class="btn btn-ghost" id="explainBtn">Explain this choice</button>
            <button class="btn btn-primary ai-checkout-btn">Order this dish</button>
          </div>

          <div class="rating">
            <p>Rate this suggestion:</p>
            ${[1,2,3,4,5].map((n) => `<span class="star" data-value="${n}">★</span>`).join("")}
          </div>
        </div>
      </div>
    `;

    box.querySelectorAll(".badge-forbidden").forEach((el) => {
        el.parentElement.style.opacity = "0.65";
    });

    box.querySelectorAll(".replace-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const li = btn.closest("li");
            const textSpan = li?.querySelector(".ing-text");
            if (!li || !textSpan) return;

            const currentName = textSpan.textContent.trim();

            // поточний список інгредієнтів у рецепті (вже з урахуванням попередніх замін)
            const allIngredients = [...box.querySelectorAll(".ai-chef__ingredients .ing-text")]
                .map(el => el.textContent.trim())
                .filter(Boolean);

            // ---------- LOADING UI ----------
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.classList.add("is-loading");
            btn.textContent = "Picking...";
            // -------------------------------

            try {
                let altList = await suggestAlternatives(currentName, {
                    taste,
                    allergens: allergensStr,
                    recipeName: r.name,
                    ingredients: allIngredients
                });

                altList = (altList || []).map(v => String(v || "").trim());

                // Базова нормалізація для порівняння
                const normalizeName = (s) => String(s || "")
                    .toLowerCase()
                    .replace(/—.*$/,"")
                    .replace(/[-(),]/g," ")
                    .replace(/\b(fresh|dried|low-sodium|smoked|ground|chopped|minced|optional|for garnish|to taste|taste|medium|large|small)\b/g,"")
                    .replace(/\s+/g," ")
                    .trim();

                const originalNorm = normalizeName(currentName);

                // фільтр сміття
                altList = altList
                    .filter(Boolean)
                    .filter(v => !/^alternative\s*\d*/i.test(v))
                    .filter(v => normalizeName(v) && normalizeName(v) !== originalNorm)
                    .filter((v, i, arr) => arr.indexOf(v) === i); // унікальні

                if (!altList.length) {
                    return; // нічого адекватного — просто не міняємо
                }

                // випадкова альтернатива
                let replacement = altList[Math.floor(Math.random() * altList.length)];
                if (!replacement || !replacement.trim()) return;

                // --- Підганяємо формат під існуючий ---
                const hasDashOriginal = /—|-/.test(currentName);
                const hasDashNew      = /—|-/.test(replacement);

                if (hasDashOriginal && !hasDashNew) {
                    const [origName, origRestRaw] = currentName.split(/—|-/);
                    const suffix = (origRestRaw || "").trim();   // "1 cup", "80–100 g" тощо
                    const cleanName = replacement.replace(/—.*$/,"").trim();
                    replacement = suffix ? `${cleanName} — ${suffix}` : cleanName;
                }

                textSpan.textContent = replacement;
                btn.dataset.item = replacement;

                li.classList.add("replaced");
                setTimeout(() => li.classList.remove("replaced"), 400);
            } finally {
                btn.disabled = false;
                btn.classList.remove("is-loading");
                btn.textContent = originalText;
            }
        });
    });


    box.querySelector("#explainBtn")?.addEventListener("click", () => {
        alert(
            r.explanation ||
            "The dish is tuned to your preferences and limits (diet, taste, allergens)."
        );
    });

    box.querySelector(".ai-checkout-btn")?.addEventListener("click", () => {
        addToCart({
            id: `ai-${Date.now()}`,                // по id будемо розуміти, що це AI
            title: r.name || "AI chef dish",
            unitPrice: pricePerServing,
            description: r.summary || "",
            ai: true,
            aiIngredients: Array.isArray(r.ingredients) ? r.ingredients : []
        });

        openCart();
    });



    const stars = box.querySelectorAll(".rating .star");

// відновити останній рейтинг з localStorage
    const last = Number(localStorage.getItem("lastRecipeRating") || 0);
    if (last) {
        stars.forEach(s => {
            s.classList.toggle("active", +s.dataset.value <= last);
        });
    }

// клік — зберігаємо як раніше
    stars.forEach((star) => {
        star.addEventListener("click", (e) => {
            const val = +e.currentTarget.dataset.value;
            localStorage.setItem("lastRecipeRating", val);
            stars.forEach((s) => {
                s.classList.toggle("active", +s.dataset.value <= val);
            });
        });

        // hover: підсвічуємо зліва направо
        star.addEventListener("mouseenter", (e) => {
            const val = +e.currentTarget.dataset.value;
            stars.forEach((s) => {
                s.classList.toggle("hover", +s.dataset.value <= val);
            });
        });

        star.addEventListener("mouseleave", () => {
            stars.forEach((s) => s.classList.remove("hover"));
        });
    });
}

// Просимо бекенд/AI підібрати альтернативний інгредієнт
async function suggestAlternatives(currentItem, context = {}) {
    const email = getCurrentUserEmail();
    const payload = {
        ingredient: currentItem,
        recipeName: context.recipeName || "",
        taste: context.taste || null,          // твій tastePayload
        allergens: context.allergens || "",    // рядок алергенів
        ingredients: context.ingredients || [],// поточний список інгредієнтів
        userEmail: email || null
    };

    try {
        const resp = await fetch(`${API_BASE}/api/ai-chef/replace`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (resp.ok) {
            const data = await resp.json();

            // варіант 1: бекенд повертає один варіант
            if (data.alternative && typeof data.alternative === "string") {
                return [data.alternative];
            }
            // варіант 2: масив можливих варіантів
            if (Array.isArray(data.alternatives) && data.alternatives.length) {
                return data.alternatives;
            }
        }
    } catch (e) {
        console.warn("AI replace error:", e);
    }

    // 🔙 Fallback: якщо AI впав / немає бекенда – робимо просту, але адекватну заміну
    const base = currentItem.toLowerCase();

    if (base.includes("cheese")) {
        return ["feta", "mozzarella", "tofu", "vegan parmesan"];
    }
    if (base.includes("chicken")) {
        return ["turkey", "tofu", "lentils", "mushrooms"];
    }
    if (base.includes("cream")) {
        return ["coconut milk", "oat cream", "greek yogurt"];
    }

    // останній варіант – повернути той самий інгредієнт (щоб точно не було "alternative 1")
    return [currentItem];
}

/* ================== TASTE LEVELS (spice / sweet / salt / acid) ================== */

// Labels for taste sliders
const TASTE_HINTS = {
    spice: [
        "Very mild, almost no heat",
        "A gentle touch of spice",
        "Noticeably spicy",
        "For spice lovers",
        "Fiery hot 🌶️"
    ],
    sweet: [
        "Barely sweet",
        "Moderately sweet",
        "Like a homemade dessert",
        "Very sweet",
        "Maximum sweetness 🍯"
    ],
    salt: [
        "Almost no salt",
        "Lightly salted",
        "Balanced salt level",
        "Well salted",
        "Very salty 🧂"
    ],
    acid: [
        "Soft, almost no acidity",
        "A light refreshing tang",
        "Clearly tangy",
        "Bright, zesty acidity",
        "Very sour, like lemon 🍋"
    ]
};

/**
 * Updates UI for a single taste scale:
 *  - active dot
 *  - hidden input
 *  - explanatory label under the scale
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

// taste-dot click delegation
document.addEventListener("click", (e) => {
    const dot = e.target.closest(".taste-dot");
    if (!dot) return;

    const scale = dot.closest(".taste-scale");
    if (!scale) return;

    const field = scale.dataset.field;
    const value = +dot.dataset.value || 1;

    updateTasteUI(field, value);
});

// initialize taste values on page load
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
        alert("Invalid email address");
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

    alert("Thank you for subscribing! ✉️");
    inputEl.value = "";
}

window.sendEmail = sendEmail;
/* ============================================================
   8) USER PANEL (off-canvas) + real auth backend
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

    // ======= DOM for auth =======
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

    // ======= LocalStorage helpers =======
    function read(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
        catch { return fallback; }
    }
    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // ---- auth in localStorage: user + token ----
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

        // !!! ВАЖЛИВО: тут уже НЕ оголошуємо API_BASE ще раз
        // Використовуємо глобальний API_BASE і додаємо /api
        const API_PREFIX = `${API_BASE || ""}/api`;

        async function api(path, options = {}) {
            const token = getToken();
            const headers = {
                "Content-Type": "application/json",
                ...(options.headers || {})
            };
            if (token) {
                headers.Authorization = "Bearer " + token;
            }
            const res = await fetch(API_PREFIX + path, {
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



    // ======= Render auth state =======
    function renderAuth() {
        const u = getCurrentUser();
        const isAuth = !!u;

        // update global email for cart / AI
        currentUserEmail = isAuth ? (u.email || null) : null;

        // підтягуємо кошик, прив'язаний до цього email
        if (typeof loadCartFromStorage === "function") {
            loadCartFromStorage();
        }

        if (typeof updateCartDisplay === "function") {
            updateCartDisplay();
        }
        if (typeof updateCartTotals === "function") {
            updateCartTotals();
        }


        guestView.hidden = isAuth;
        userView.hidden  = !isAuth;

        if (isAuth) {
            const name  = u.name || "User";
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

            // pull data for account
            renderFavorites();
            renderOrders();
            renderPoints();
        } else {
            userNameEl.textContent  = "Guest";
            userEmailEl.textContent = "You are not logged in";
            avatarInit.textContent  = "U";
            if (headerInitial) headerInitial.hidden = true;
            headerBtn.classList.remove("is-auth");
            headerBtn.title = "Guest";
        }
    }

    // ======= Switch login / signup modes =======
    function switchAuthMode(mode) {
        if (!guestForms) return;

        guestForms.hidden = false;
        guestActions?.classList.add("is-collapsed");

        panel.classList.remove("auth-mode-login", "auth-mode-signup");
        panel.classList.add(mode === "login" ? "auth-mode-login" : "auth-mode-signup");
        if (guestNote) {
            guestNote.style.display = "none";
        }

        loginForm.hidden  = mode !== "login";
        signupForm.hidden = mode !== "signup";

        if (loginError)  loginError.textContent  = "";
        if (signupError) signupError.textContent = "";

        btnShowLogin?.classList.toggle("is-selected", mode === "login");
        btnShowSignup?.classList.toggle("is-selected", mode === "signup");

        panel.scrollTo({ top: guestForms.offsetTop - 40, behavior: "smooth" });
    }

    btnShowLogin?.addEventListener("click", () => switchAuthMode("login"));
    btnShowSignup?.addEventListener("click", () => switchAuthMode("signup"));
    const bottomSwitchBtns = $all(".auth-switch-btn");
    bottomSwitchBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.target; // "login" or "signup"
            if (target === "login" || target === "signup") {
                switchAuthMode(target);
            }
        });
    });

    // ======= Validation helpers =======
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
        if (e.endsWith("@gma.com")) return "Maybe you meant @gmail.com?";
        return "Invalid email.";
    }
    function isValidPassword(pw) {
        return typeof pw === "string" && pw.length >= 8;
    }

    // ======= Password show/hide toggles =======
    $all(".password-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const field = btn.closest(".password-field");
            const input = field?.querySelector("input");
            if (!input) return;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.classList.toggle("is-active", show);
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        });
    });

    // ======= Login (/api/auth/login) =======
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
            loginError.textContent = "Password must be at least 8 characters long.";
            return;
        }

        try {
            const data = await api("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            setAuth(data.user, data.token);

            if (typeof renderPoints === "function") {
                renderPoints();
            }
            if (typeof renderFavorites === "function") {
                renderFavorites();
            }
            if (typeof renderOrders === "function") {
                renderOrders();
            }

            closePanel();
        } catch (err) {
            loginError.textContent = err.message;
        }
    });

    // ======= Signup (/api/auth/signup) =======
    signupForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!signupError) return;
        signupError.textContent = "";

        const fd = new FormData(signupForm);
        const name  = String(fd.get("name") || "User").trim();
        const email = String(fd.get("email") || "").trim();
        const password = String(fd.get("password") || "");

        if (!name) {
            signupError.textContent = "Please enter your name.";
            return;
        }
        if (!isValidEmail(email)) {
            signupError.textContent = emailTypoHint(email);
            return;
        }
        if (!isValidPassword(password)) {
            signupError.textContent = "Password must be at least 8 characters long.";
            return;
        }

        try {
            const data = await api("/auth/signup", {
                method: "POST",
                body: JSON.stringify({ name, email, password })
            });

            setAuth(data.user, data.token);

            if (typeof renderPoints === "function") {
                renderPoints();
            }
            if (typeof renderFavorites === "function") {
                renderFavorites();
            }
            if (typeof renderOrders === "function") {
                renderOrders();
            }

            closePanel();
        } catch (err) {
            signupError.textContent = err.message;
        }
    });

    // ======= Logout =======
    $("#btnLogout")?.addEventListener("click", () => {
        setAuth(null, null);
    });

    // ======= Tabs inside user panel =======
    const tabBtns = $all(".user-tabs .tab");
    const panels  = $all(".tab-panels .panel");

    function showTab(key) {
        tabBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tab === key));
        panels.forEach(p => p.toggleAttribute("hidden", p.dataset.panel !== key));
    }
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => showTab(btn.dataset.tab));
    });

    // ======= Tammy points from backend =======
    async function renderPoints() {
        const badgeValueEl   = document.getElementById("pointsValue");
        const profileBriefEl = document.getElementById("profilePointsBrief");
        const historyBox     = document.getElementById("pointsHistory");

        currentPointsBalance = 0;
        if (badgeValueEl)   badgeValueEl.textContent   = "0";
        if (profileBriefEl) profileBriefEl.textContent = "0";
        if (historyBox)     historyBox.innerHTML      = "";

        const user = getCurrentUser();
        if (!user) {
            if (historyBox) {
                historyBox.innerHTML =
                    '<p class="soft-note">Log in to start earning Tammy points.</p>';
            }
            updateCartModal();
            return;
        }

        try {
            const data = await api("/user/points");

            const balance = Number(data.balance || 0);
            const history = Array.isArray(data.history) ? data.history : [];

            currentPointsBalance = balance;

            if (badgeValueEl)   badgeValueEl.textContent   = String(balance);
            if (profileBriefEl) profileBriefEl.textContent = String(balance);

            if (historyBox) {
                if (!history.length) {
                    historyBox.innerHTML =
                        '<p class="soft-note">No points yet. Save recipes or place an order to start earning.</p>';
                } else {
                    historyBox.innerHTML = history
                        .map((ev) => {
                            const delta = Number(ev.delta || 0);
                            const sign  = delta >= 0 ? "+" : "−";
                            const cls   = delta >= 0 ? "points-row--plus" : "points-row--minus";
                            const abs   = Math.abs(delta);
                            const reason = ev.reason || "Points update";
                            const time   = ev.created_at
                                ? new Date(ev.created_at).toLocaleString()
                                : "";

                            return `
                            <article class="points-row ${cls}">
                                <div class="points-row__main">
                                    <span class="points-row__delta">${sign}${abs}</span>
                                    <span class="points-row__reason">${reason}</span>
                                </div>
                                <time class="points-row__time">${time}</time>
                            </article>
                        `;
                        })
                        .join("");
                }
            }

            updateCartModal();
        } catch (err) {
            console.warn("renderPoints error:", err);
            if (historyBox) {
                historyBox.innerHTML =
                    `<p class="soft-note">Failed to load points: ${err.message}</p>`;
            }
            currentPointsBalance = 0;
            updateCartModal();
        }
    }

    // ======= Toggle “How to earn points” FAQ =======
    const pointsBadgeEl = document.getElementById("pointsBadge");
    const pointsFaqEl   = document.getElementById("pointsFaq");

    if (pointsBadgeEl && pointsFaqEl) {
        pointsBadgeEl.addEventListener("click", () => {
            pointsFaqEl.hidden = !pointsFaqEl.hidden;
            pointsBadgeEl.classList.toggle("points-pill--active", !pointsFaqEl.hidden);
        });
    }

    // ======= Render favourites from backend =======
    async function renderFavorites() {
        const user     = getCurrentUser();
        const listBox  = $("#savedRecipesList");
        const emptyBox = $("#favsEmpty");

        if (!listBox) return;

        listBox.innerHTML = "";

        if (!user) {
            if (emptyBox) {
                emptyBox.hidden = false;
                emptyBox.innerHTML = "⭐ Log in to see your favourite recipes.";
            }
            const counter = $("#profileFavCount");
            if (counter) counter.textContent = "0";
            return;
        }

        try {
            const rows = await api("/user/favorites");

            const groups = new Map();

            for (const r of rows) {
                let ings = [];
                try {
                    ings = Array.isArray(r.ingredients)
                        ? r.ingredients
                        : JSON.parse(r.ingredients || "[]");
                } catch {
                    ings = [];
                }

                const priceNum = Number(r.total_price ?? r.totalPrice ?? 0);
                const kcalNum  = Number(r.total_kcal  ?? r.totalKcal  ?? 0);
                const key = [
                    r.title,
                    priceNum.toFixed(2),
                    kcalNum,
                    ings.join(",")
                ].join("|");

                if (!groups.has(key)) {
                    groups.set(key, {
                        row: {
                            ...r,
                            _ings : ings,
                            _price: priceNum,
                            _kcal : kcalNum
                        },
                        ids: new Set()
                    });
                }
                groups.get(key).ids.add(r.id);
            }

            const uniqueEntries = Array.from(groups.values());

            const counter = $("#profileFavCount");
            if (counter) counter.textContent = String(uniqueEntries.length);

            if (!uniqueEntries.length) {
                if (emptyBox) {
                    emptyBox.hidden = false;
                    emptyBox.innerHTML = `
                    ⭐ Your favourites list is empty.<br>
                    Save your first recipe from the builder!
                `;
                }
                return;
            }

            if (emptyBox) {
                emptyBox.hidden = true;
            }

            uniqueEntries.forEach(({ row: r, ids }) => {
                const ings      = r._ings;
                const createdAt = r.created_at
                    ? new Date(r.created_at).toLocaleString()
                    : "";

                const price = r._price.toFixed(2);
                const kcal  = r._kcal;
                const ingsCount = ings.length;
                const allIds = Array.from(ids);

                const card = document.createElement("article");
                card.className = "saved-card";

                card.innerHTML = `
    <header class="saved-header">
        <div class="saved-header-main">
            <h4 class="saved-title">${r.title}</h4>
            <span class="saved-count">${ingsCount} ingredients</span>
        </div>

        <div class="saved-pill">
            <span class="saved-pill__price">${price}$</span>
            <span class="saved-pill__dot">•</span>
            <span class="saved-pill__kcal">${kcal} kcal</span>
        </div>
    </header>

    <div class="saved-body">
        <div class="saved-ings">
            <span class="saved-ings-label">Ingredients:</span>
            <span class="saved-ings-text">${ings.join(", ")}</span>
        </div>

        <footer class="fav-footer">
            <span class="fav-date">${createdAt}</span>
            <button class="fav-remove-btn"
                    data-ids="${allIds.join(",")}"
                    title="Remove from favourites">
                🗑
            </button>
        </footer>
    </div>
`;

                const deleteBtn = card.querySelector(".fav-remove-btn");

                if (deleteBtn) {
                    deleteBtn.addEventListener("click", async () => {
                        const idsStr = deleteBtn.dataset.ids || "";
                        const ids = idsStr
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean);

                        if (!ids.length) return;
                        if (!confirm("Remove this recipe from favourites?")) return;

                        try {
                            for (const id of ids) {
                                await api(`/user/favorites/${id}`, { method: "DELETE" });
                            }

                            card.classList.add("fade-remove");

                            setTimeout(async () => {
                                await renderFavorites();
                                await renderPoints();
                                window.dispatchEvent(new Event("favsUpdated"));
                            }, 300);
                        } catch (err) {
                            alert("Failed to remove recipe: " + err.message);
                        }
                    });
                }

                listBox.appendChild(card);
            });

        } catch (err) {
            if (emptyBox) {
                emptyBox.hidden = false;
                emptyBox.innerHTML = `
                ⚠️ Failed to load favourites:<br>${err.message}
            `;
            }
        }
    }

    // Normalize items array from different backend formats
    function extractOrderItems(o) {
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.order_items)) return o.order_items;

        if (o.items && typeof o.items === "object" && Array.isArray(o.items.items)) {
            return o.items.items;
        }

        function parseJsonArray(val) {
            if (typeof val !== "string") return null;
            const t = val.trim();
            if (!t) return null;
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) return parsed;
                if (parsed && Array.isArray(parsed.items)) return parsed.items;
            } catch {
                return null;
            }
            return null;
        }

        let parsed =
            parseJsonArray(o.items) ||
            parseJsonArray(o.items_json) ||
            parseJsonArray(o.order_items);

        if (parsed) return parsed;

        return [];
    }

    // ======= Render orders from backend =======
    async function renderOrders() {
        const user = getCurrentUser();
        const box  = $("#ordersList");
        if (!box) return;
        box.innerHTML = "";

        if (!user) {
            box.innerHTML = '<p class="soft-note">Log in to see your orders.</p>';
            return;
        }

        try {
            const rows = await api("/user/orders");
            const counter = $("#profileOrderCount");
            if (counter) counter.textContent = rows.length.toString();

            if (!rows.length) {
                box.innerHTML = '<p class="soft-note">No orders yet. Try placing your first order 🍽️</p>';
                return;
            }

            rows.forEach(o => {
                const status = (o.status || "new").toLowerCase();
                const createdAt = o.created_at
                    ? new Date(o.created_at).toLocaleString()
                    : "";
                const earned = Number(o.earned_points || 0);

                const items = extractOrderItems(o);
                const itemsCount = Number(
                    o.items_count != null
                        ? o.items_count
                        : (Array.isArray(items) ? items.length : 0)
                );

                let itemsPreview = "";
                if (items.length) {
                    const names = items.slice(0, 3).map(it => it.title || it.name || "Dish");
                    itemsPreview = names.join(", ") + (items.length > 3 ? "…" : "");
                }

                const detailsHtml = items.length
                    ? `
            <div class="orders-details" hidden>
                <p class="orders-details-title">Items in this order:</p>
                <ul class="orders-details-list">
                    ${items.map(it => {
                        const q = Number(it.quantity || 1);
                        const u = Number(it.unitPrice ?? it.unit_price ?? 0);
                        return `
                        <li class="orders-details-row">
                            <span class="orders-details-item-title">
                                ${it.title || it.name || "Dish"}
                            </span>
                            <span class="orders-details-item-meta">
                                ×${q} · ${u.toFixed(2)} ₴
                            </span>
                        </li>`;
                    }).join("")}
                </ul>
                <p class="orders-details-note">
                    Re-order and delivery tracking are coming soon.
                </p>
            </div>`
                    : `
            <div class="orders-details" hidden>
                <p class="orders-details-note">
                    Order breakdown (dishes list) will appear here soon.
                </p>
            </div>`;

                const amount = Number(o.total_price || 0).toFixed(2);

                const card = document.createElement("article");
                card.className = `saved-card orders-card orders-card--${status}`;
                card.dataset.orderId = o.id;

                card.innerHTML = `
            <div class="orders-main-row">
                <div class="orders-title-col">
                    <div class="orders-id-row">
                        <span class="orders-hash">#</span>
                        <span class="saved-title">Order ${o.id}</span>
                    </div>

                    <div class="saved-meta-row">
                        <span class="order-amount">
                            <span class="order-amount-label">Amount:</span>
                            ${amount} ₴
                        </span>

                        ${itemsCount ? `
                        <span class="order-items-chip">
                            ${itemsCount} item${itemsCount > 1 ? "s" : ""}
                        </span>` : ""}

                        <span class="order-status status-pill status-pill--${status}">
                            ${status}
                        </span>
                    </div>

                    ${itemsPreview ? `
                    <p class="orders-preview-line">
                        ${itemsPreview}
                    </p>` : ""}
                </div>

                ${earned > 0 ? `
                <div class="orders-points-pill">
                    <span class="orders-points-label">+${earned}</span>
                    <span class="orders-points-caption">Tammy pts</span>
                </div>` : ""}
            </div>

            <footer class="orders-footer">
                <time class="saved-date">${createdAt}</time>
                <span class="orders-mini-note">
                    Tap to see order details
                </span>
                <span class="orders-chevron" aria-hidden="true">⌄</span>
            </footer>

            ${detailsHtml}
        `;

                box.appendChild(card);
            });

            if (!box._ordersDetailsBound) {
                box.addEventListener("click", (e) => {
                    const card = e.target.closest(".orders-card");
                    if (!card) return;

                    const details = card.querySelector(".orders-details");
                    if (!details) return;

                    const expanded = card.classList.toggle("orders-card--expanded");
                    details.hidden = !expanded;

                    const chevron = card.querySelector(".orders-chevron");
                    if (chevron) chevron.classList.toggle("is-open", expanded);
                });

                box._ordersDetailsBound = true;
            }

        } catch (err) {
            box.innerHTML = `<p class="soft-note">Failed to load orders: ${err.message}</p>`;
        }
    }

    // expose for other parts
    window.renderPoints    = renderPoints;
    window.renderOrders    = renderOrders;
    window.renderFavorites = renderFavorites;

    // ======= Public API for builder / checkout =======
    window.tammyUser = {
        async addFavorite(recipe) {
            const user = getCurrentUser();
            if (!user) {
                alert("Please log in to save recipes.");
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
                alert("Recipe saved to your account ✅");
            } catch (err) {
                alert("Failed to save recipe: " + err.message);
            }
        },

        async addOrder(orderPayload) {
            if (!orderPayload || !Array.isArray(orderPayload.items) || !orderPayload.items.length) {
                alert("Your cart is empty.");
                return;
            }
            const user = getCurrentUser();

            try {
                const res = await fetch("/api/orders", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        userEmail: user?.email || null,
                        items: orderPayload.items
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || "Failed to create order.");
                }

                renderOrders();
                renderPoints();
                const pts = data.earnedPoints || 0;
                if (pts > 0) {
                    alert(`Order #${data.orderId} created ✅\nYou earned +${pts} Tammy points!`);
                } else {
                    alert(`Order #${data.orderId} created ✅`);
                }
            } catch (err) {
                alert("Failed to create order: " + err.message);
            }
        }
    };

    // ======= INIT =======
    renderAuth();
    const activeTab = panel.querySelector(".user-tabs .tab.is-active")?.dataset.tab || "profile";
    showTab(activeTab);
})();





