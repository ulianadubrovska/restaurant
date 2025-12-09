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

// ---- Middlewares ----
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ---- Extra loading of server/.env before importing provider ----
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
const {
    generateRecipe,
    generateHint,
    generateAiChefDish,
    generateIngredientAlternatives,
    pickModel,
} = await import("./ai/provider.js");


// optional warm-up (without timeouts)
pickModel().catch((e) => console.warn("[AI] warm-up skipped:", e?.message));

/* ============================================================
   1) HEALTHCHECK (AI enabled / not)
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
   2) DISHES from MySQL
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
   3) RATING (stars)
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
   4) INGREDIENTS (builder)
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
        };

        for (const r of rows) {
            if (!ingredients[r.category]) continue;
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
   5) BUILDER RECIPES (favorites from builder)
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

        const result = await query(
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
   6) AI: RECIPE (builder)
   ============================================================ */
app.post("/api/recipe", async (req, res) => {
    try {
        const { picked = {}, profile = {}, userEmail = null } = req.body || {};
        const recipe = await generateRecipe({ picked, profile });

        // logging
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

        // fallback in English
        const all = Object.values(req.body?.picked || {}).flat();
        const kcal = all.reduce((s, x) => s + (+x.kcal || 0), 0) || 520;

        res.json({
            name: all[0]?.name ? `${all[0].name} — chef's pick` : "Home dish",
            method: "Pan",
            time_active: 10,
            time_passive: 0,
            kcal,
            story: "A tasty and balanced dish with pleasant texture and harmony of flavor.",
        });
    }
});

/* ============================================================
   7) AI: HINT (builder)
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
            hint: "Add some acidity (lemon/vinegar) to balance the flavor.",
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
   8.1) AI-CHEF recommendation
   ============================================================ */
app.post("/api/ai-chef", async (req, res) => {
    try {
        const { taste = {}, userEmail = null } = req.body || {};

        const recipe = await generateAiChefDish({ taste });

        try {
            await query(
                `INSERT INTO ai_recipes_log (kind, user_email, request, response)
                 VALUES ('ai_chef', ?, ?, ?)`,
                [
                    userEmail || null,
                    JSON.stringify({ taste }),
                    JSON.stringify(recipe || {}),
                ]
            );
        } catch (logErr) {
            console.warn("AI log error (ai_chef):", logErr);
        }

        res.json(recipe);
    } catch (e) {
        console.error("AI-chef error:", e);

        res.json({
            name: "Simple home dish",
            summary:
                "A light, balanced meal without complex ingredients, quick to prepare.",
            time: 25,
            difficulty: "Easy",
            kcal: 520,
            fitScore: 75,
            image: "",
            ingredients: [
                "Cooked grain or pasta — 80–100 g",
                "Vegetables — 150 g",
                "Light dressing with olive oil",
            ],
            steps: [
                "Cook the base (grain/pasta).",
                "Prepare and lightly cook vegetables.",
                "Mix, season and serve.",
            ],
            explanation:
                "Fallback version in case of AI error — still tasty and safe.",
        });
    }
});
/* ============================================================
   8.2) AI-CHEF ingredient replacement (Replace button)
   ============================================================ */
app.post("/api/ai-chef/replace", async (req, res) => {
    try {
        const {
            ingredient,
            recipeName = "",
            taste = null,
            allergens = "",
            ingredients = [],
            userEmail = null,
        } = req.body || {};

        if (!ingredient) {
            return res.status(400).json({ error: "ingredient is required" });
        }

        const result = await generateIngredientAlternatives({
            ingredient,
            recipeName,
            taste,
            allergens,
            ingredients,
        });

        const list =
            result && Array.isArray(result.alternatives)
                ? result.alternatives
                : [];

        // логування в ту ж таблицю, що й інші AI-відповіді
        try {
            await query(
                `INSERT INTO ai_recipes_log (kind, user_email, request, response)
                 VALUES ('ai_replace', ?, ?, ?)`,
                [
                    userEmail || null,
                    JSON.stringify({
                        ingredient,
                        recipeName,
                        taste,
                        allergens,
                        ingredients,
                    }),
                    JSON.stringify({ alternatives: list }),
                ]
            );
        } catch (logErr) {
            console.warn("AI log error (ai_replace):", logErr);
        }

        res.json({ alternatives: list });
    } catch (e) {
        console.error("AI-chef replace error:", e);
        // fallback — повертаємо хоча б сам інгредієнт, щоб інтерфейс не ламався
        res.json({ alternatives: [] });
    }
});

/* ============================================================
   9) ORDERS (cart → MySQL + Tammy points)
   ============================================================ */
app.post("/api/orders", async (req, res) => {
    try {
        const { userEmail, items, pointsToUse } = req.body || {};

        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "Cart is empty" });
        }

        let subtotal = 0;
        const cleanItems = items.map((it) => {
            const quantity  = Number(it.quantity || 1);
            const price     = Number(it.unitPrice || 0);
            const lineTotal = price * quantity;

            subtotal += lineTotal;

            return {
                dishId:    it.dishId ? Number(it.dishId) : null,
                builderId: it.builderId ? Number(it.builderId) : null,
                title:     String(it.title || "Item"),
                unitPrice: price,
                quantity,
            };
        });

        const totalBeforeDiscount = subtotal;

        let pointsUsed = 0;
        let earned     = 0;
        let newBalance = null;

        /* POINTS LOGIC */
        if (userEmail) {
            // find current balance
            const rowsSum = await query(
                `SELECT COALESCE(SUM(delta),0) AS balance
                 FROM user_points
                 WHERE user_email = ?`,
                [userEmail]
            );
            const currentBalance = rowsSum[0]?.balance || 0;

            const requested  = Math.max(0, Math.floor(Number(pointsToUse || 0)));
            const maxByTotal = Math.floor(totalBeforeDiscount);

            pointsUsed = Math.min(currentBalance, requested, maxByTotal);
        }

        const totalPaid = Math.max(0, totalBeforeDiscount - pointsUsed);

        const orderResult = await query(
            `INSERT INTO orders (user_email, total_price, status)
             VALUES (?, ?, 'new')`,
            [userEmail || null, totalPaid.toFixed(2)]
        );
        const orderId = orderResult.insertId;

        for (const it of cleanItems) {
            await query(
                `INSERT INTO order_items (order_id, dish_id, builder_id, title, unit_price, quantity)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, it.dishId, it.builderId, it.title, it.unitPrice, it.quantity]
            );
        }

        if (userEmail) {
            // deduct points
            if (pointsUsed > 0) {
                await query(
                    `INSERT INTO user_points (user_email, delta, reason, order_id)
                     VALUES (?, ?, ?, ?)`,
                    [
                        userEmail,
                        -pointsUsed,
                        `Points deducted for order #${orderId}`,
                        orderId,
                    ]
                );
            }

            // earn new points
            const pointsBase = subtotal;
            earned = Math.floor(pointsBase / 10);

            if (earned > 0) {
                await query(
                    `INSERT INTO user_points (user_email, delta, reason, order_id)
                     VALUES (?, ?, ?, ?)`,
                    [
                        userEmail,
                        earned,
                        `Points for order #${orderId}`,
                        orderId,
                    ]
                );
            }

            // recalc balance
            const rowsBalance = await query(
                `SELECT COALESCE(SUM(delta),0) AS balance
                 FROM user_points
                 WHERE user_email = ?`,
                [userEmail]
            );
            newBalance = rowsBalance[0]?.balance || 0;
        }

        res.json({
            ok: true,
            orderId,
            subtotal,
            totalBeforeDiscount,
            totalPaid,
            pointsUsed,
            earnedPoints: earned,
            pointsBalance: newBalance
        });

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

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

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
    console.error("❌ index.html not found. Check paths.");
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
    console.log(`✅ Server running at http://localhost:${PORT}`)
);
