// server.js — БЕЗ таймаутів у маршрутах і health

import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { query } from "./db.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
app.use(express.json());
// === Зберегти рецепт з конструктора у базу ===
app.post("/api/builder-recipes", async (req, res) => {
    const { userEmail, title, totalPrice, totalKcal, ingredients } = req.body || {};

    if (!title || !Array.isArray(ingredients) || !ingredients.length) {
        return res.status(400).json({ error: "Некоректні дані рецепта" });
    }

    try {
        const [result] = await query(
            `INSERT INTO builder_recipes (user_email, title, total_price, total_kcal, ingredients)
             VALUES (?, ?, ?, ?, ?)`,
            [
                userEmail || null,
                title,
                Number(totalPrice) || 0,
                Number(totalKcal) || 0,
                JSON.stringify(ingredients),
            ]
        );

        res.json({ ok: true, id: result.insertId });
    } catch (err) {
        console.error("DB builder_recipes error:", err);
        res.status(500).json({ error: "DB error" });
    }
});
// === Отримати збережені рецепти користувача ===
app.get("/api/builder-recipes", async (req, res) => {
    const { email } = req.query;

    try {
        let rows;
        if (email) {
            rows = await query(
                `SELECT id, user_email, title, total_price, total_kcal, ingredients, created_at
                 FROM builder_recipes
                 WHERE user_email = ?
                 ORDER BY created_at DESC
                 LIMIT 50`,
                [email]
            );
        } else {
            rows = await query(
                `SELECT id, user_email, title, total_price, total_kcal, ingredients, created_at
                 FROM builder_recipes
                 ORDER BY created_at DESC
                 LIMIT 50`
            );
        }

        res.json({ items: rows });
    } catch (err) {
        console.error("DB builder_recipes list error:", err);
        res.status(500).json({ error: "DB error" });
    }
});
// === Підписка на newsletter ===
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

// Підтягнемо server/.env до імпорту провайдера
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

// Динамічний імпорт провайдера
const { generateRecipe, generateHint, pickModel } = await import("./ai/provider.js");

// (опційно) прогрів моделі — БЕЗ таймаутів
pickModel().catch(e => console.warn("[AI] warm-up skipped:", e?.message));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

/* ---------- HEALTH ---------- */
app.get("/api/health", async (req, res) => {
    const anyProvider =
        !!process.env.GEMINI_API_KEY ||
        !!process.env.OPENAI_API_KEY ||
        !!process.env.OLLAMA_BASE_URL;

    // якщо не сконфігуровано взагалі — false
    if (!anyProvider) return res.json({ ai: false });

    // тут просто перевіряємо, що pickModel не впав
    try {
        await pickModel();
        return res.json({ ai: true });
    } catch {
        return res.json({ ai: false });
    }
});
/* ---------- API: dishes з MySQL ---------- */
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
/* ---------- API: ingredients з MySQL ---------- */
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
        };

        for (const r of rows) {
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
// ================== BUILDER RECIPES (constructor favorites) ==================

// GET /api/builder-recipes  → список останніх збережених рецептів
app.get("/api/builder-recipes", async (req, res) => {
    try {
        const rows = await query(
            `SELECT 
                 id,
                 title,
                 total_price   AS price,
                 kcal,
                 ingredients_json,
                 created_at
             FROM builder_recipes
             ORDER BY created_at DESC
             LIMIT 50`
        );

        const recipes = rows.map(r => ({
            id: r.id,
            title: r.title,
            price: Number(r.price ?? 0),
            kcal: r.kcal ?? 0,
            ingredients: JSON.parse(r.ingredients_json || "[]"),
            created_at: r.created_at
        }));

        res.json({ recipes });
    } catch (err) {
        console.error("DB builder_recipes GET error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

// POST /api/builder-recipes  → зберегти один рецепт з конструктора
app.post("/api/builder-recipes", async (req, res) => {
    try {
        const { title, price, kcal, ingredients } = req.body || {};

        if (!title || !Array.isArray(ingredients) || !ingredients.length) {
            return res.status(400).json({ error: "Invalid recipe payload" });
        }

        const totalPrice = Number(price ?? 0);
        const kcalVal    = Number(kcal ?? 0);
        const ingJson    = JSON.stringify(ingredients);

        const result = await query(
            `INSERT INTO builder_recipes (title, total_price, kcal, ingredients_json)
             VALUES (?, ?, ?, ?)`,
            [title, totalPrice, kcalVal, ingJson]
        );

        res.json({
            ok: true,
            id: result.insertId ?? null
        });
    } catch (err) {
        console.error("DB builder_recipes POST error:", err);
        res.status(500).json({ error: "DB error" });
    }
});
// ================== NEWSLETTER (footer email) ==================

app.post("/api/newsletter", async (req, res) => {
    try {
        const { email } = req.body || {};
        const re =
            /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i;

        if (!email || !re.test(email)) {
            return res.status(400).json({ error: "Invalid email" });
        }

        // якщо в таблиці email зроблений UNIQUE, то дублікати просто оновлюємо
        await query(
            `INSERT INTO newsletter_subscribers (email)
             VALUES (?)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [email.trim()]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error("DB newsletter error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

/* ---------- API ---------- */
// БЕЗ таймаутів — чекаємо модель стільки, скільки потрібно
app.post("/api/recipe", async (req, res) => {
    try {
        const { picked = {}, profile = {} } = req.body || {};
        const recipe = await generateRecipe({ picked, profile });
        res.json(recipe);
    } catch (e) {
        console.error("AI error:", e);
        // повертаємо короткий фолбек
        const all = Object.values(req.body?.picked || {}).flat();
        const kcal = all.reduce((s,x)=>s+(+x.kcal||0),0) || 520;
        res.json({
            name: (all[0]?.name ? `${all[0].name} — шеф подає` : "Домашня страва"),
            method: "Пательня",
            time_active: 10,
            time_passive: 0,
            kcal,
            story: "Смачна та збалансована страва з приємною текстурою та гармонією смаку."
        });
    }
});

app.post("/api/hint", async (req, res) => {
    try {
        const { picked = {} } = req.body || {};
        const { hint } = await generateHint({ picked });
        res.json({ hint });
    } catch (e) {
        console.error("AI hint error:", e);
        res.json({ hint: "Додайте трохи кислотності (лимон/оцет) для балансу смаку." });
    }
});

/* ---------- STATIC ---------- */
const candidates = [
    path.resolve(__dirname, "../restaurant"),
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../client"),
    path.resolve(__dirname, ".."),
];

let FRONT_DIR = null;
for (const p of candidates) {
    if (fs.existsSync(path.join(p, "index.html"))) { FRONT_DIR = p; break; }
}
if (!FRONT_DIR) {
    console.error("❌ Не знайшов index.html. Перевірте шляхи.");
} else {
    console.log("✅ Static root:", FRONT_DIR);
    app.use(express.static(FRONT_DIR, {
        extensions: ["html"],
        maxAge: "1h",
        setHeaders(res){ res.setHeader("Cache-Control", "public, max-age=3600"); }
    }));
    app.get(["/", "/index.html"], (_, res) => res.sendFile(path.join(FRONT_DIR, "index.html")));
    app.use((req, res, next) => {
        if (req.path.startsWith("/api/")) return next();
        const tryPath = path.join(FRONT_DIR, req.path);
        if (fs.existsSync(tryPath)) return res.sendFile(tryPath);
        return res.sendFile(path.join(FRONT_DIR, "index.html"));
    });
}

app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
