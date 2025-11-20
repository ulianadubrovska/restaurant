// server/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_TAMMYFOOD";

/**
 * Реєстрація
 * POST /api/auth/signup
 * body: { name, email, password }
 */
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Заповніть всі поля." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Пароль має містити мінімум 8 символів." });
        }

        const [rows] = await pool.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );
        if (rows.length) {
            return res.status(400).json({ error: "Такий email вже зареєстрований." });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        // Вітальний бонус 125 балів
        await pool.query(
            "INSERT INTO user_points (user_email, delta, reason) VALUES (?, ?, ?)",
            [email, 125, "Вітальний бонус за реєстрацію"]
        );

        const user = { id: result.insertId, name, email };
        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });

        res.json({ user, token });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Внутрішня помилка сервера." });
    }
});

/**
 * Логін
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await pool.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );
        if (!rows.length) {
            return res.status(400).json({ error: "Користувача з таким email не знайдено." });
        }
        const userRow = rows[0];

        const ok = await bcrypt.compare(password, userRow.password_hash);
        if (!ok) {
            return res.status(400).json({ error: "Невірний пароль." });
        }

        const user = { id: userRow.id, name: userRow.name, email: userRow.email };
        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });

        res.json({ user, token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Внутрішня помилка сервера." });
    }
});

export default router;
