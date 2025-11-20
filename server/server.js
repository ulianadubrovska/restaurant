// server/server.js
import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { query } from "./db.js";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Мідлвари ----
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ---- Додаткове завантаження server/.env до імпорту провайдера ----
const localEnv = path.resolve(__dirname, "./.env");
if (fs.existsSync(localEnv)) {
    console.log("[ENV] Found server/.env → loading manually");
    const lines = fs.readFileSync(localEnv, "utf-8").split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.startsWith("#")) continue;
        const idx = line.indexOf("=");
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key && val && !process.env[key]) process.env[key] = val;
    }
}

// ---- AI provider (Gemini/OpenAI/Ollama) ----
const { generateRecipe, generateHint, pickModel } = await import("./ai/provider.js");

// опційно прогріваємо модель (без таймаутів)
pickModel().catch((e) => console.warn("[AI] warm-up skipped:", e?.message));

/* ============================================================
   1) HEALTHCHECK (AI увімкнений / ні)
   ============================================================ */
app.get("/api/health", async (req, res) => {
    const anyProvider =
        !!process.env.GEMINI_API_KEY ||
        !!process.env.OPENAI_API_KEY ||
        !!process.env.OLLAMA_BASE_URL;

    if (!anyProvider) {
        return res.json({ ai: false });
    }

    try {
        await pickModel();
        return res.json({ ai: true });
    } catch {
        return res.json({ ai: false });
    }
});

/* ============================================================
   2) DISHES з MySQL
   ============================================================ */
app.get("/api/dishes", async (req, res) => {
    try {
        const rows = await query("SELECT * FROM dishes ORDER BY id");

        const dish = rows.map((r) => ({
            id: r.id,
            title: r.title,
            desc: r.short_desc,
            price: Number(r.price).toFixed(2),
            stars: r.stars,
            photo: r.photo,
            typePhoto: r.type_photo,
            back: {
                long: r.back_long,
                ingredients: r.back_ingredients_json
                    ? JSON.parse(r.back_ingredients_json)
                    : [],
                grams: r.back_grams,
                volume_ml: r.back_volume_ml,
            },
        }));

        res.json({ dish });
    } catch (e) {
        console.error("DB dishes error:", e);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   3) RATING страв (зірочки)
   ============================================================ */
app.post("/api/dish-rating", async (req, res) => {
    try {
        const { dishId, rating, userEmail, userHash } = req.body || {};

        const dish_id = Number(dishId);
        const value   = Number(rating);

        if (!dish_id || !Number.isInteger(value) || value < 1 || value > 5) {
            return res.status(400).json({ error: "Invalid rating payload" });
        }

        const hash = userHash || null;

        await query(
            `INSERT INTO dish_ratings (dish_id, user_hash, rating)
             VALUES (?, ?, ?)`,
            [dish_id, hash, value]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error("DB dish-rating error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   4) INGREDIENTS (для конструктора)
   ============================================================ */
app.get("/api/ingredients", async (req, res) => {
    try {
        const rows = await query(
            "SELECT * FROM ingredients ORDER BY category, id"
        );

        const ingredients = {
            base: [],
            protein: [],
            veggies: [],
            sauces: [],
            herbs: [],
            drinks: [],
            // якщо додаси crunch/dessert в БД – сюди теж
        };

        for (const r of rows) {
            if (!ingredients[r.category]) continue; // безпечний захист
            ingredients[r.category].push({
                id: r.id,
                name: r.name,
                photo: r.photo,
                price: Number(r.price),
                kcal: r.kcal,
                taste: r.taste,
            });
        }

        res.json({ ingredients });
    } catch (e) {
        console.error("DB ingredients error:", e);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   5) BUILDER RECIPES (улюблені з конструктора)
   ============================================================ */
app.get("/api/builder-recipes", async (req, res) => {
    try {
        const { email } = req.query;

        const params = [];
        let sql = `
            SELECT 
                id,
                user_email,
                title,
                total_price   AS price,
                total_kcal    AS kcal,
                ingredients,
                created_at
            FROM builder_recipes
        `;

        if (email) {
            sql += " WHERE user_email = ? ";
            params.push(email);
        }

        sql += " ORDER BY created_at DESC LIMIT 50";

        const rows = await query(sql, params);

        const recipes = rows.map((r) => ({
            id: r.id,
            user_email: r.user_email,
            title: r.title,
            price: Number(r.price ?? 0),
            kcal: r.kcal ?? 0,
            ingredients: (() => {
                try {
                    return Array.isArray(r.ingredients)
                        ? r.ingredients
                        : JSON.parse(r.ingredients || "[]");
                } catch {
                    return [];
                }
            })(),
            created_at: r.created_at,
        }));

        res.json({ recipes });
    } catch (err) {
        console.error("DB builder_recipes GET error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

app.post("/api/builder-recipes", async (req, res) => {
    try {
        const { userEmail, title, price, kcal, ingredients } = req.body || {};

        if (!title || !Array.isArray(ingredients) || !ingredients.length) {
            return res.status(400).json({ error: "Invalid recipe payload" });
        }

        const totalPrice = Number(price ?? 0);
        const kcalVal    = Number(kcal ?? 0);
        const ingJson    = JSON.stringify(ingredients);

        const [result] = await query(
            `INSERT INTO builder_recipes (user_email, title, total_price, total_kcal, ingredients)
             VALUES (?, ?, ?, ?, ?)`,
            [userEmail || null, title, totalPrice, kcalVal, ingJson]
        );

        res.json({
            ok: true,
            id: result.insertId ?? null,
        });
    } catch (err) {
        console.error("DB builder_recipes POST error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   6) AI: RECIPE (конструктор)
   ============================================================ */
app.post("/api/recipe", async (req, res) => {
    try {
        const { picked = {}, profile = {}, userEmail = null } = req.body || {};
        const recipe = await generateRecipe({ picked, profile });

        try {
            await query(
                `INSERT INTO ai_recipes_log (kind, user_email, request, response)
                 VALUES ('builder_recipe', ?, ?, ?)`,
                [
                    userEmail || null,
                    JSON.stringify({ picked, profile }),
                    JSON.stringify(recipe || {}),
                ]
            );
        } catch (logErr) {
            console.warn("AI log error (recipe):", logErr);
        }

        res.json(recipe);
    } catch (e) {
        console.error("AI error:", e);

        const all = Object.values(req.body?.picked || {}).flat();
        const kcal = all.reduce((s, x) => s + (+x.kcal || 0), 0) || 520;

        res.json({
            name: all[0]?.name ? `${all[0].name} — шеф подає` : "Домашня страва",
            method: "Пательня",
            time_active: 10,
            time_passive: 0,
            kcal,
            story: "Смачна та збалансована страва з приємною текстурою та гармонією смаку.",
        });
    }
});

/* ============================================================
   7) AI: HINT (підказка в конструкторі)
   ============================================================ */
app.post("/api/hint", async (req, res) => {
    try {
        const { picked = {}, userEmail = null } = req.body || {};
        const { hint } = await generateHint({ picked });

        try {
            await query(
                `INSERT INTO ai_recipes_log (kind, user_email, request, response)
                 VALUES ('hint', ?, ?, ?)`,
                [
                    userEmail || null,
                    JSON.stringify({ picked }),
                    JSON.stringify({ hint }),
                ]
            );
        } catch (logErr) {
            console.warn("AI log error (hint):", logErr);
        }

        res.json({ hint });
    } catch (e) {
        console.error("AI hint error:", e);
        res.json({
            hint: "Додайте трохи кислотності (лимон/оцет) для балансу смаку.",
        });
    }
});

/* ============================================================
   8) TASTE PROFILE (AI-chef)
   ============================================================ */
app.post("/api/taste-profile", async (req, res) => {
    try {
        const { userEmail, profile } = req.body || {};
        if (!userEmail || !profile) {
            return res.status(400).json({ error: "userEmail and profile required" });
        }

        await query(
            `INSERT INTO taste_profiles (user_email, profile)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE profile = VALUES(profile)`,
            [userEmail, JSON.stringify(profile)]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error("DB taste-profile error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

app.get("/api/taste-profile", async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: "email is required" });

        const rows = await query(
            `SELECT profile FROM taste_profiles WHERE user_email = ? LIMIT 1`,
            [email]
        );

        if (!rows.length) return res.json({ profile: null });

        const raw = rows[0].profile;
        let profile;
        try {
            profile = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            profile = raw;
        }

        res.json({ profile });
    } catch (err) {
        console.error("DB taste-profile GET error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   9) ORDERS (кошик → MySQL)
   ============================================================ */
app.post("/api/orders", async (req, res) => {
    try {
        const { userEmail, items } = req.body || {};
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "Cart is empty" });
        }

        let total = 0;
        const cleanItems = items.map((it) => {
            const quantity  = Number(it.quantity || 1);
            const price     = Number(it.unitPrice || 0);
            const lineTotal = price * quantity;
            total += lineTotal;
            return {
                dishId:   it.dishId ? Number(it.dishId) : null,
                builderId: it.builderId ? Number(it.builderId) : null,
                title:    String(it.title || "Item"),
                unitPrice: price,
                quantity,
            };
        });

        const [orderResult] = await query(
            `INSERT INTO orders (user_email, total_price, status)
             VALUES (?, ?, 'new')`,
            [userEmail || null, total.toFixed(2)]
        );
        const orderId = orderResult.insertId;
        for (const it of cleanItems) {
            await query(
                `INSERT INTO order_items (order_id, dish_id, builder_id, title, unit_price, quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, it.dishId, it.builderId, it.title, it.unitPrice, it.quantity]
            );
        }

// 1 бал за кожні 10 ₴, якщо є email
        if (userEmail) {
            const earned = Math.floor(total / 10);
            if (earned > 0) {
                await query(
                    `INSERT INTO user_points (user_email, delta, reason)
             VALUES (?, ?, ?)`,
                    [userEmail, earned, "Бали за замовлення"]
                );
            }
        }

        res.json({ ok: true, orderId, total });

    } catch (err) {
        console.error("DB order error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

/* ============================================================
   10) NEWSLETTER (footer email → MySQL)
   ============================================================ */
app.post("/api/newsletter", async (req, res) => {
    const { email, source } = req.body || {};

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        await query(
            `INSERT INTO newsletter_subscribers (email, source)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE source = VALUES(source)`,
            [email, source || "footer-form"]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error("DB newsletter error:", err);
        res.status(500).json({ error: "DB error" });
    }
});
app.use("/api/auth", authRoutes);   // /api/auth/signup , /api/auth/login
app.use("/api/user", userRoutes);   // /api/user/me, /favorites, /orders, /points
/* ============================================================
   11) STATIC FRONTEND
   ============================================================ */
const candidates = [
    path.resolve(__dirname, "../restaurant"),
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../client"),
    path.resolve(__dirname, ".."),
];

let FRONT_DIR = null;
for (const p of candidates) {
    if (fs.existsSync(path.join(p, "index.html"))) {
        FRONT_DIR = p;
        break;
    }
}

if (!FRONT_DIR) {
    console.error("❌ Не знайшов index.html. Перевірте шляхи.");
} else {
    console.log("✅ Static root:", FRONT_DIR);

    app.use(
        express.static(FRONT_DIR, {
            extensions: ["html"],
            maxAge: "1h",
            setHeaders(res) {
                res.setHeader("Cache-Control", "public, max-age=3600");
            },
        })
    );

    app.get(["/", "/index.html"], (req, res) =>
        res.sendFile(path.join(FRONT_DIR, "index.html"))
    );

    // SPA-fallback: усе, що не /api, віддаємо index.html
    app.use((req, res, next) => {
        if (req.path.startsWith("/api/")) return next();
        const tryPath = path.join(FRONT_DIR, req.path);
        if (fs.existsSync(tryPath)) return res.sendFile(tryPath);
        return res.sendFile(path.join(FRONT_DIR, "index.html"));
    });
}

/* ============================================================
   12) START
   ============================================================ */
app.listen(PORT, () =>
    console.log(`✅ Server on http://localhost:${PORT}`)
);
