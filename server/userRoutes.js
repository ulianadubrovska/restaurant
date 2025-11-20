// server/userRoutes.js
import express from "express";
import { pool } from "./db.js";
import { requireAuth } from "./authMiddleware.js";

const router = express.Router();

// ---------- Профіль + баланс балів ----------
router.get("/me", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;

        const [userRows] = await pool.query(
            "SELECT id, name, email, created_at FROM users WHERE email = ?",
            [email]
        );
        if (!userRows.length) {
            return res.status(404).json({ error: "Користувача не знайдено." });
        }

        const user = userRows[0];

        const [pointRows] = await pool.query(
            "SELECT COALESCE(SUM(delta),0) AS balance FROM user_points WHERE user_email = ?",
            [email]
        );
        const balance = pointRows[0].balance || 0;

        res.json({ user, pointsBalance: balance });
    } catch (err) {
        console.error("GET /me error", err);
        res.status(500).json({ error: "Внутрішня помилка сервера." });
    }
});

// ---------- Вподобання (builder_recipes) ----------

// GET всі рецепти користувача
router.get("/favorites", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const [rows] = await pool.query(
            "SELECT id, title, total_price, total_kcal, ingredients, created_at " +
            "FROM builder_recipes WHERE user_email = ? ORDER BY created_at DESC",
            [email]
        );
        res.json(rows);
    } catch (err) {
        console.error("GET /favorites error", err);
        res.status(500).json({ error: "Не вдалося завантажити вподобання." });
    }
});

// POST новий рецепт + бали
router.post("/favorites", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const { title, totalPrice, totalKcal, ingredients } = req.body;

        const [result] = await pool.query(
            "INSERT INTO builder_recipes (user_email, title, total_price, total_kcal, ingredients) " +
            "VALUES (?, ?, ?, ?, ?)",
            [email, title, totalPrice, totalKcal, JSON.stringify(ingredients || [])]
        );

        // +5 балів за збережений рецепт
        await pool.query(
            "INSERT INTO user_points (user_email, delta, reason) VALUES (?, ?, ?)",
            [email, 5, "Збережений рецепт з конструктора"]
        );

        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error("POST /favorites error", err);
        res.status(500).json({ error: "Не вдалося зберегти рецепт." });
    }
});

// ---------- Замовлення (тільки читання) ----------
router.get("/orders", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const [rows] = await pool.query(
            `SELECT 
                 o.id,
                 o.total_price,
                 o.status,
                 o.created_at,
                 COUNT(oi.id) AS items_count
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_email = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [email]
        );
        res.json(rows);
    } catch (err) {
        console.error("GET /orders error", err);
        res.status(500).json({ error: "Не вдалося завантажити замовлення." });
    }
});

// ---------- Бали ----------
router.get("/points", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;

        const [sumRows] = await pool.query(
            "SELECT COALESCE(SUM(delta),0) AS balance FROM user_points WHERE user_email = ?",
            [email]
        );
        const balance = sumRows[0].balance || 0;

        const [historyRows] = await pool.query(
            "SELECT delta, reason, created_at FROM user_points " +
            "WHERE user_email = ? ORDER BY created_at DESC LIMIT 50",
            [email]
        );

        res.json({ balance, history: historyRows });
    } catch (err) {
        console.error("GET /points error", err);
        res.status(500).json({ error: "Не вдалося завантажити бали." });
    }
});

export default router;
