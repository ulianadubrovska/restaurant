// server/userRoutes.js
import express from "express";
import { pool } from "./db.js";
import { requireAuth } from "./authMiddleware.js";

const router = express.Router();

// ---------- Profile + Points Balance ----------
router.get("/me", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;

        const [userRows] = await pool.query(
            "SELECT id, name, email, created_at FROM users WHERE email = ?",
            [email]
        );
        if (!userRows.length) {
            return res.status(404).json({ error: "User not found." });
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
        res.status(500).json({ error: "Internal server error." });
    }
});

// ---------- Favorites (builder_recipes) ----------

// GET all user's saved recipes
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
        res.status(500).json({ error: "Failed to load favorites." });
    }
});

// POST new favorite recipe + points
router.post("/favorites", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const { title, totalPrice, totalKcal, ingredients } = req.body;

        const [result] = await pool.query(
            "INSERT INTO builder_recipes (user_email, title, total_price, total_kcal, ingredients) " +
            "VALUES (?, ?, ?, ?, ?)",
            [email, title, totalPrice, totalKcal, JSON.stringify(ingredients || [])]
        );

        // +5 points for saving a recipe
        await pool.query(
            "INSERT INTO user_points (user_email, delta, reason) VALUES (?, ?, ?)",
            [email, 5, "Saved recipe from builder"]
        );

        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error("POST /favorites error", err);
        res.status(500).json({ error: "Failed to save the recipe." });
    }
});

// DELETE a saved recipe
router.delete("/favorites/:id", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const favId = Number(req.params.id);

        if (!favId) {
            return res.status(400).json({ error: "Invalid recipe ID." });
        }

        const [result] = await pool.query(
            "DELETE FROM builder_recipes WHERE id = ? AND user_email = ?",
            [favId, email]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ error: "Recipe not found." });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /favorites error", err);
        res.status(500).json({ error: "Failed to delete the recipe." });
    }
});

// ---------- Orders (read-only with items) ----------
router.get("/orders", requireAuth, async (req, res) => {
    try {
        const email = req.user.email;

        const [orders] = await pool.query(
            `
            SELECT 
                o.id,
                o.user_email,
                o.total_price,
                o.status,
                o.created_at,
                COALESCE(up.earned_points, 0) AS earned_points,
                COUNT(DISTINCT oi.id) AS items_count
            FROM orders o
            LEFT JOIN order_items oi 
                ON oi.order_id = o.id
            LEFT JOIN (
                SELECT order_id, SUM(delta) AS earned_points
                FROM user_points
                WHERE delta > 0 AND reason LIKE 'Points for order%'
                GROUP BY order_id
            ) up ON up.order_id = o.id
            WHERE o.user_email = ?
            GROUP BY o.id, up.earned_points
            ORDER BY o.created_at DESC
            LIMIT 50
            `,
            [email]
        );

        if (!orders.length) return res.json([]);

        const ids = orders.map(o => o.id);
        const placeholders = ids.map(() => "?").join(",");

        const [itemRows] = await pool.query(
            `
            SELECT order_id, title, unit_price, quantity
            FROM order_items
            WHERE order_id IN (${placeholders})
            ORDER BY id
            `,
            ids
        );

        const itemsByOrder = {};
        for (const r of itemRows) {
            if (!itemsByOrder[r.order_id]) itemsByOrder[r.order_id] = [];
            itemsByOrder[r.order_id].push({
                title: r.title,
                unitPrice: Number(r.unit_price),
                quantity: Number(r.quantity)
            });
        }

        const result = orders.map(o => ({
            id: o.id,
            user_email: o.user_email,
            total_price: Number(o.total_price),
            status: o.status,
            created_at: o.created_at,
            earned_points: o.earned_points,
            items_count: o.items_count,
            items: itemsByOrder[o.id] || []
        }));

        res.json(result);

    } catch (err) {
        console.error("GET /orders error", err);
        res.status(500).json({ error: "Failed to load orders." });
    }
});

// ---------- Points ----------
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
        res.status(500).json({ error: "Failed to load points." });
    }
});

export default router;
