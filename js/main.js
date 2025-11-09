"use strict";

/* ================== ГЛОБАЛ ================== */
let data;
let div_num;
let main_page;

// AOS
AOS.init();

/* ===== Cart open (фікс класу .cart) ===== */
document.addEventListener("click", (e) => {
    const a = e.target.closest("a.cart");
    if (!a) return;
    e.preventDefault();
    openCart();
});

/* ===== Back to top ===== */
jQuery(function () {
    jQuery(window).scroll(function () {
        jQuery("#myBtn").css("opacity", jQuery(this).scrollTop() > 600 ? "1" : "0");
    });
    jQuery("#myBtn").click(function () {
        jQuery("body,html").animate({ scrollTop: 0 }, 200);
        return false;
    });
});

/* ================== MENU: завантаження + пагінація ================== */
fetch("../db/menu/dish.json")
    .then((response) => response.json())
    .then((json) => {
        data = json;

        const menuBlock = document.getElementById("menuParent");
        const newArr = data.dish.map((item) => item);

        // Рендер елементів меню
        newArr.forEach(function (item, index) {
            menuBlock.insertAdjacentHTML(
                "beforeend",
                renderDishItem(
                    item.title,
                    item.desc,
                    item.price,
                    item.stars,
                    item.photo,
                    item.typePhoto,
                    index + 1
                )
            );
        });

        // Flip on click (делегування)
        menuBlock.addEventListener("click", (e) => {
            const btn = e.target.closest("button, a");
            if (btn) return; // кнопки/лінки — НЕ фліпають
            const card = e.target.closest(".menu-block");
            if (!card) return;
            card.classList.toggle("flipped");
        });

        // Кнопки "в кошик"
        document.querySelectorAll(".button-shop-1").forEach((button, btnIndex) => {
            button.classList.add("add-to-cart");
            button.setAttribute("data-index", String(btnIndex));
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                addToCart(data.dish[btnIndex]);
                openCart();
            });
        });

        // Пагінація
        const count = newArr.length;
        const itemsPerPage = 8;
        const totalPages = Math.ceil(count / itemsPerPage);

        buildPaginator(totalPages);
        div_num = document.querySelectorAll(".num");

        // Показати перші itemsPerPage
        div_num.forEach((item, index) => {
            item.style.display = index < itemsPerPage ? "flex" : "none";
        });

        // Активувати 1-у сторінку
        main_page = document.getElementById("page1");
        if (main_page) main_page.classList.add("paginator_active");

        // Prev / Next
        const prevButton = document.getElementById("page-prev");
        const nextButton = document.getElementById("page-next");
        if (prevButton) prevButton.addEventListener("click", () => changePage(-1));
        if (nextButton) nextButton.addEventListener("click", () => changePage(1));
        initRatings();

        // Лічильник кошика
        updateCartDisplay();
    })
    .catch((err) => console.error("Menu load error:", err));

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
    if (main_page) main_page.classList.remove("paginator_active");
    main_page = document.getElementById(`page${pageNum}`);
    if (main_page) main_page.classList.add("paginator_active");

    const itemsPerPage = 8;
    const count = div_num.length;
    const startIndex = (pageNum - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, count);

    div_num.forEach((item, index) => {
        item.style.display = index >= startIndex && index < endIndex ? "flex" : "none";
    });
}

function renderDishItem(title, desc, price, stars, photo, typePhoto, itemId) {
    const parts = desc.split(",").map((s) => s.trim()).filter(Boolean);
    const listHTML = parts.length > 1
        ? `<ul class="menu-card__ul">${parts.map((p) => `<li>${p}</li>`).join("")}</ul>`
        : "";

    const saved = (JSON.parse(localStorage.getItem("ratings") || "{}"))[title] || 0;

    const starsHTML = [...Array(5)]
        .map((_, i) => {
            const n = i + 1;
            const active = n <= saved ? "is-active" : "";
            return `<button class="star ${active}" data-value="${n}" aria-label="${n} з 5" title="${n}/5">★</button>`;
        })
        .join("");

    return `
  <div data-num="${itemId}" class="num menu-block" aria-label="${title}" role="button">
    <div class="menu-card__inner">
      <div class="menu-card__front">
        <div class="dish">
          <img height="130" src="img/photo/menu/${photo}.${typePhoto}" alt="${title}">
        </div>
        <div class="rating-stars" role="radiogroup" aria-label="Оцініть страву" data-title="${title}">
          ${starsHTML}
        </div>
        <p class="dish-title">${title}</p>
        <div class="menu-card__actions">
          <span class="price-chip">$${price}</span>
          <button class="button-shop-1 add-to-cart" data-index="${itemId - 1}" aria-label="Додати «${title}» у кошик">
            <img src="img/icons/menu/dish-icon1.svg" alt="">
          </button>
        </div>
      </div>
      <div class="menu-card__back" aria-hidden="true">
        <h4>${title}</h4>
        <p>${desc}</p>
        ${listHTML}
        <div class="menu-card__price">
          <span class="price-chip">$${price}</span>
          <span class="menu-card__hint">Натисни, щоб повернути</span>
        </div>
      </div>
    </div>
  </div>`;
}

// === РЕЙТИНГ: підсвічення + збереження ===
function initRatings() {
    document.querySelectorAll(".rating-stars").forEach((group) => {
        const stars = group.querySelectorAll(".star");
        const title = group.dataset.title; // ключ для localStorage

        const saved = JSON.parse(localStorage.getItem("ratings") || "{}")[title] || 0;
        if (saved) highlightStars(stars, saved);

        group.addEventListener("click", (e) => {
            const btn = e.target.closest(".star");
            if (!btn) return;
            e.stopPropagation();
            const value = +btn.dataset.value;
            highlightStars(stars, value);
            saveRating(title, value);
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

function highlightStars(stars, value) {
    stars.forEach((st) => st.classList.toggle("is-active", +st.dataset.value <= value));
}
function saveRating(title, value) {
    const ratings = JSON.parse(localStorage.getItem("ratings") || "{}");
    ratings[title] = value;
    localStorage.setItem("ratings", JSON.stringify(ratings));
}

/* ================== CART ================== */
let cart = JSON.parse(localStorage.getItem("cart")) || [];

function addToCart(dish) {
    const existing = cart.find((item) => item.title === dish.title);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        dish.quantity = 1;
        cart.push(dish);
    }
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartDisplay();
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
    const cartItems = document.getElementById("cart-items");
    cartItems.innerHTML = "";
    let total = 0;
    cart.forEach((item, index) => {
        const itemTotal = parseFloat(item.price) * (item.quantity || 1);
        total += itemTotal;
        cartItems.insertAdjacentHTML(
            "beforeend",
            `<li>
        ${item.title} - $${item.price} x <span class="quantity">${item.quantity || 1}</span>
        <div class="quantity-controls">
          <button onclick="updateQuantity(${index}, -1)">-</button>
          <button onclick="updateQuantity(${index}, 1)">+</button>
          <button onclick="removeItem(${index})">Видалити</button>
        </div>
      </li>`
        );
    });
    document.getElementById("cart-total").textContent = total.toFixed(2);
}

function updateQuantity(index, change) {
    if (cart[index].quantity + change > 0) {
        cart[index].quantity += change;
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

function placeOrder() {
    if (cart.length === 0) return alert("Ваш кошик порожній!");
    alert(`Замовлення оформлено! Сума: $${document.getElementById("cart-total").textContent}`);
    cart = [];
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartModal();
    updateCartDisplay();
    closeCart();
}

/* ================== How it works: анімація ліній ================== */
document.addEventListener("DOMContentLoaded", () => {
    const lines = document.querySelectorAll(".overlay-1, .overlay-2");
    const aboutUsSection = document.querySelector(".about-us");
    if (!aboutUsSection) return;

    const observer = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    lines.forEach((line, index) => {
                        line.style.animation = `revealImage 5s ease-in-out ${index * 5}s forwards`;
                    });
                    observer.unobserve(aboutUsSection);
                }
            });
        },
        { threshold: 0.5 }
    );

    observer.observe(aboutUsSection);
});

/* ================== Конструктор інгредієнтів (JSON) ================== */
let ingredients = {};
const ingredientList = document.getElementById("ingredient-list");
// === ВИБРАНІ ІНГРЕДІЄНТИ (стан)
const picked = {
    base: [], protein: [], veggies: [], crunch: [],
    sauces: [], herbs: [], drinks: [], dessert: []
};
fetch("../db/ingredients/ingredients.json")
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
            updateCompositionUI();
            updateTotalsAndPreview();   // <-- нове
            updateHints();
            updateTotalsAndPreview();
            updateTabCounters();
        });
    });
}



document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelector(".tab.active")?.classList.remove("active");
        btn.classList.add("active");
        const cat = btn.dataset.cat;
        localStorage.setItem("lastCat", cat);   // <-- запам’ятовуємо
        renderIngredients(cat);
    });
});

function collectChips(container) {
    return [...container.querySelectorAll(".chip.active")].map((b) => b.textContent.trim());
}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("chip")) {
        e.target.classList.toggle("active");
    }
});


// позначка лічильника на табах (опційно, але дуже зручно)
function updateTabCounters() {
    document.querySelectorAll(".category-tabs .tab").forEach(btn => {
        const cat = btn.dataset.cat;
        const n = picked[cat]?.length || 0;
        btn.querySelector(".tab-count")?.remove();
        if (n > 0) {
            const b = document.createElement("span");
            b.className = "tab-count";
            b.textContent = n;
            btn.appendChild(b);
        }
    });
}
function updateCompositionUI() {
    const ul = document.getElementById("compositionList");
    if (!ul) return;
    const flat = Object.entries(picked).flatMap(([cat, arr]) => arr.map(v => ({cat, v})));
    ul.innerHTML = flat.map(x => `<li>${x.v.name}</li>`).join("");
}

// ---------------- Підсумки + прев’ю рецепта ----------------
function sumSelected(arr){
    return arr.reduce((acc, x) => {
        acc.price += x.price || 0;
        acc.kcal  += x.kcal  || 0;
        acc.names.push(x.name);
        return acc;
    }, {price:0, kcal:0, names:[]});
}

function estimateTime() {
    // дуже проста евристика
    const t =  (picked.base.length   ? 12 : 0)
        + (picked.protein.length? 10 : 0)
        + (picked.veggies.length*3)
        + (picked.sauces.length ? 1  : 0);
    return Math.max(8, t);
}

function generateSteps() {
    const steps = [];
    if (picked.base.length) {
        const b = picked.base.map(x=>x.name).join(", ");
        steps.push(`Ми підготуємо основу (${b}): відваримо/приготуємо до ідеальної готовності.`);
    }
    if (picked.protein.length) {
        const p = picked.protein.map(x=>x.name).join(", ");
        steps.push(`Далі приготуємо протеїн (${p}) до золотистої скоринки та соковитості всередині.`);
    }
    if (picked.veggies.length || picked.herbs.length) {
        const v = [...picked.veggies, ...picked.herbs].map(x=>x.name).join(", ");
        steps.push(`Додамо свіжі овочі та зелень (${v}) — частину злегка прогріємо, частину подамо свіжою.`);
    }
    if (picked.sauces.length) {
        const s = picked.sauces.map(x=>x.name).join(", ");
        steps.push(`Заправимо фірмовим соусом (${s}) та делікатно перемішаємо.`);
    }
    if (picked.crunch.length) {
        const c = picked.crunch.map(x=>x.name).join(", ");
        steps.push(`Перед подачею додамо хрумкий акцент (${c}) для текстури.`);
    }
    if (!steps.length) steps.push("Додайте інгредієнти — і ми сформуємо рецепт від ресторану.");
    return steps;
}

function updateTotalsAndPreview(){
    // 1) підсумки
    const all = Object.values(picked).flat();
    const totals = sumSelected(all);
    const priceEl = document.getElementById("price");
    const calEl   = document.getElementById("calories");
    if (priceEl) priceEl.textContent = `$${totals.price.toFixed(2)}`;
    if (calEl)   calEl.textContent   = `${totals.kcal} kcal`;

    // 2) прев’ю-страва
    const preview = document.getElementById("dishPreview");
    if (!preview) return;
    if (!all.length){
        preview.innerHTML = `
      <div class="preview-placeholder">
        <h3>Тут буде ваш рецепт</h3>
        <p>Додайте інгредієнти — і ми зберемо страву від ресторану.</p>
      </div>`;
        return;
    }

    const name = [
        picked.base[0]?.name || "Страва",
        picked.protein[0]?.name ? `з ${picked.protein[0].name.toLowerCase()}` : ""
    ].join(" ").trim();

    const time = estimateTime();
    const steps = generateSteps().map(s=>`<li>${s}</li>`).join("");
    let tip = "";
    if (!picked.sauces.length) {
        tip = "Додай соус — він зв'яже смаки та додасть соковитості.";
    } else if (!picked.veggies.length && !picked.herbs.length) {
        tip = "Трішки зелені або овочів зроблять страву свіжішою.";
    } else {
        tip = "Спробуй краплю лимонного соку або щіпку перцю перед подачею.";
    }

    preview.innerHTML = `
  <div class="auto-recipe">
    <h3>Рецепт від ресторану: ${name}</h3>
    <p><b>Час:</b> ~${time} хв • <b>Разом:</b> $${totals.price.toFixed(2)}, ${totals.kcal} ккал</p>
    <h4>Кроки</h4>
    <ol class="ai-steps">${steps}</ol>
    <div class="chef-tip" style="margin-top:10px">👨‍🍳 ${tip}</div>
  </div>`;
}


const aiHintEl  = document.getElementById("aiHint");
const chefTipEl = document.querySelector(".chef-tip");

function setHint(el, text, mode="info"){
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hint--ok","hint--warn","hint--info");
    el.classList.add(`hint--${mode}`);
    el.style.display = text ? "block" : "none";
}

function isBalanced() {
    const hasBase   = picked.base.length > 0;
    const protN     = picked.protein.length;
    const hasVeg    = picked.veggies.length > 0 || picked.herbs.length > 0;
    const hasSauce  = picked.sauces.length > 0;
    // просте «добре»: є основа, 1–2 протеїни, є овочі/зелень і соус
    return hasBase && (protN >= 1 && protN <= 2) && hasVeg && hasSauce;
}

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
        const recipe = await sendToAI(payload);
        renderRecipe(recipe);
    });
}

/* Точніше правило crunch→соус ставимо перед загальним "нема соусу" */
function updateHints() {
    if (picked.base.length === 0) {
        setHint(aiHintEl, "Додай основу, щоб почати конструктор.", "warn");
    } else if (picked.crunch.length && picked.sauces.length === 0) {
        setHint(aiHintEl, "Crunch краще працює з соусом або кремовою базою.", "info");
    } else if (picked.sauces.length === 0) {
        setHint(aiHintEl, "Порада: обери соус для балансу смаку.", "info");
    } else if (picked.protein.length > 2) {
        setHint(aiHintEl, "Багато протеїну — спробуй забалансувати овочами.", "warn");
    } else if (picked.protein.length >= 1 && (picked.veggies.length === 0 && picked.herbs.length === 0)) {
        setHint(aiHintEl, "Додай трохи зелені або овочів для свіжості.", "info");
    } else {
        setHint(aiHintEl, "", "info");
    }

    if (isBalanced()) {
        setHint(chefTipEl, "Супер! Страва збалансована. Додай щіпку зелені або лимон — буде ще краще.", "ok");
    } else {
        const activeTab = document.querySelector(".category-tabs .tab.active")?.dataset.cat;
        if (activeTab === "drinks") setHint(chefTipEl, "До вершкової пасти пасує лимонад або матча.", "info");
        else if (activeTab === "dessert") setHint(chefTipEl, "Солодке? Спробуй брауні або сорбет після основної страви.", "info");
        else setHint(chefTipEl, "Шеф радить: спробуй додати трохи зелені для свіжості!", "info");
    }
}

// Збереження профілю
const saveProfileBtn = document.getElementById("saveProfile");
if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", () => {
        const form = document.getElementById("tasteForm");
        const data = Object.fromEntries(new FormData(form).entries());
        data.cuisines = collectChips(form.querySelector('[data-name="cuisines"]'));
        data.gear = collectChips(form.querySelector('[data-name="gear"]'));
        localStorage.setItem("tasteProfile", JSON.stringify(data));
        alert("Профіль збережено ✅");
    });
}

// Підвантаження профілю
window.addEventListener("DOMContentLoaded", () => {
    const raw = localStorage.getItem("tasteProfile");
    if (!raw) return;
    const data = JSON.parse(raw);
    const form = document.getElementById("tasteForm");
    for (const [k, v] of Object.entries(data)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") el.value = v;
    }
    (data.cuisines || []).forEach((txt) => {
        [...form.querySelectorAll('[data-name="cuisines"] .chip')].forEach((ch) => {
            if (ch.textContent.trim() === txt) ch.classList.add("active");
        });
    });
    (data.gear || []).forEach((txt) => {
        [...form.querySelectorAll('[data-name="gear"] .chip')].forEach((ch) => {
            if (ch.textContent.trim() === txt) ch.classList.add("active");
        });
    });
});

/* ================== AI сабміт (мок) ================== */
document.getElementById("tasteForm").addEventListener("submit", async (e) => {
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

    const recipe = await sendToAI(payload);
    renderRecipe(recipe);
});

async function sendToAI(payload) {
    const name = payload.cuisines.includes("Середземноморська")
        ? "Салат табуле з квасолею"
        : "Болоньєзе з індички без глютену";
    return {
        name,
        summary: "Збалансована страва під твої вподобання: помірна солоність, низька солодкість, акцент на свіжій зелені.",
        time: payload.time || 25,
        difficulty: "Легка",
        kcal: 520,
        fitScore: 92,
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
    const allergens = (JSON.parse(localStorage.getItem("tasteProfile"))?.allergens || "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

    const ingredientsHTML = r.ingredients
        .map((i) => {
            const isForbidden = allergens.some((a) => i.toLowerCase().includes(a));
            return `
      <li${isForbidden ? ' class="forbidden"' : ""}>
        ${isForbidden ? `<span class="badge-forbidden">🚫</span>` : ""}${i}
        <button class="replace-btn" data-item="${i}">Замінити</button>
      </li>`;
        })
        .join("");

    box.innerHTML = `
    <div class="ai-chef__recipe">
      <h3>${r.name}</h3>
      <p>${r.summary}</p>

      <div class="ai-chef__meta">
        <span class="pill">~${r.time} хв</span>
        <span class="pill">${r.difficulty}</span>
        <span class="pill">${r.kcal} ккал</span>
      </div>

      <h4>Інгредієнти</h4>
      <ul class="ai-chef__ingredients">${ingredientsHTML}</ul>

      <h4>Кроки</h4>
      <ol class="ai-chef__steps">${r.steps.map((s) => `<li>${s}</li>`).join("")}</ol>

      <div class="actions">
        <button class="btn btn-ghost" id="explainBtn">Поясни вибір</button>
        <button class="btn btn-ghost" id="saveTemplateBtn">Зберегти як шаблон</button>
        <button class="btn btn-primary">Додати інгредієнти в кошик</button>
      </div>

      <div class="rating">
        <p>Оціни результат:</p>
        ${[1, 2, 3, 4, 5].map((n) => `<span class="star" data-value="${n}">★</span>`).join("")}
      </div>
    </div>`;

    document.querySelectorAll(".badge-forbidden").forEach((el) => {
        el.parentElement.style.opacity = "0.6";
    });

    document.querySelectorAll(".replace-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const alt = await suggestAlternatives(btn.dataset.item);
            alert(`Можна замінити "${btn.dataset.item}" на: ${alt.join(", ")}`);
        });
    });

    document.getElementById("explainBtn").addEventListener("click", () => alert(r.explanation));

    document.getElementById("saveTemplateBtn").addEventListener("click", () => {
        localStorage.setItem("aiTemplate", JSON.stringify(r));
        alert("Шаблон збережено 💾");
    });

    document.querySelectorAll(".star").forEach((star) => {
        star.addEventListener("click", (e) => {
            const val = +e.target.dataset.value;
            localStorage.setItem("lastRecipeRating", val);
            document
                .querySelectorAll(".star")
                .forEach((s) => s.classList.toggle("active", +s.dataset.value <= val));
        });
    });
}

async function suggestAlternatives(item) {
    const base = item.toLowerCase();
    if (base.includes("сир")) return ["фета", "тофу", "веганський пармезан"];
    if (base.includes("курка")) return ["індичка", "сочевиця", "гриби"];
    return ["альтернатива 1", "альтернатива 2"];
}

/* ================== Email → Telegram (демо) ================== */
function sendEmail() {
    const dataInput = document.getElementById("emailData").value.trim();
    const regexExp = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
    const isMail = regexExp.test(dataInput);

    // ⚠️ Безпека: не зберігайте реальний токен у фронтенді. Використайте бекенд-проксі.
    const config = {
        telegram: {
            token: "<PUT_YOUR_TELEGRAM_BOT_TOKEN_ON_SERVER>",
            chat: "@TammyFood"
        }
    };

    if (isMail) {
        fetch(
            `https://api.telegram.org/bot${config.telegram.token}/sendMessage?chat_id=${config.telegram.chat}&parse_mode=html&text=${encodeURIComponent(
                dataInput
            )}`
        )
            .then((r) => r.json())
            .then((d) => console.log(d))
            .catch((e) => console.error(e));
    } else {
        alert("Неправильна адреса");
    }
}
window.sendEmail = sendEmail;

/* ============================================================
   HERO: падіння інгредієнтів → показ готової страви з паром
   ============================================================ */
(function () {
    const EASE_FALL = "cubic-bezier(.25,.8,.3,1)";
    const D_FALL = 2200;
    const D_VANISH = 500;
    const GAP_AFTER = 180;
    const PASTA_LIFT = 56;
    const TOPPING_ON_PASTA = 46;
    const num = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const css = (el, name, fb = 0) => getComputedStyle(el).getPropertyValue(name) || fb;

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

/* ================== Паралакс декору в HERO (CSS-змінні) ================== */
(function () {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;
    const hero = document.querySelector(".hero");
    const decorEls = document.querySelectorAll(".decor");
    if (!hero || !decorEls.length) return;
    let rafId = 0;
    let targetX = 0,
        targetY = 0;
    function onMove(e) {
        const rect = hero.getBoundingClientRect();
        targetX = (e.clientX - rect.left) / rect.width - 0.5;
        targetY = (e.clientY - rect.top) / rect.height - 0.5;
        if (!rafId) rafId = requestAnimationFrame(apply);
    }
    function apply() {
        decorEls.forEach((el, i) => {
            const s = parseFloat(el.dataset.speed || "") || 6 + i * 2;
            el.style.setProperty("--tx", `${-targetX * s}px`);
            el.style.setProperty("--ty", `${-targetY * s}px`);
            el.style.setProperty("--rot", `${(targetX + targetY) * 2}deg`);
        });
        rafId = 0;
    }
    hero.addEventListener("mousemove", onMove);
})();

(function () {
    const btn = document.querySelector(".btn.btn-primary");
    if (!btn) return;
    const key = document.createElement("style");
    key.textContent = `@keyframes subtlePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(115,21,54,0);}40%{transform:scale(1.03);box-shadow:0 10px 22px rgba(115,21,54,.22);}}`;
    document.head.appendChild(key);
    setInterval(() => {
        btn.style.animation = "subtlePulse 1.2s ease";
        setTimeout(() => (btn.style.animation = ""), 1300);
    }, 4000);
})();

// Клавішами ← → перемикаємо вкладки категорій
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
document.getElementById('surpriseBtn')?.addEventListener('click', () => {
    // Демо-логіка: вибрати випадкову основу + 1 протеїн + 1 овоч (за наявності)
    const pickOne = arr => arr.length ? [arr[Math.floor(Math.random()*arr.length)]] : [];

    picked.base    = pickOne(ingredients.base    || []);
    picked.protein = pickOne(ingredients.protein || []);
    picked.veggies = pickOne(ingredients.veggies || []);
    // інші категорії очищаємо
    picked.crunch = []; picked.sauces = []; picked.herbs=[]; picked.drinks=[]; picked.dessert=[];

    // перерендер
    const active = document.querySelector('.category-tabs .tab.active')?.dataset.cat || 'base';
    renderIngredients(active);
    updateCompositionUI();
    updateTotalsAndPreview();
    updateTabCounters();
    updateHints();
});
