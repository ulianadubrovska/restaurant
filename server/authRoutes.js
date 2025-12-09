// server/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_TAMMYFOOD";

/**
 * Signup
 * POST /api/auth/signup
 * body: { name, email, password }
 */
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Please fill in all fields." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters long." });
        }

        const [rows] = await pool.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );
        if (rows.length) {
            return res.status(400).json({ error: "This email is already registered." });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        // Welcome bonus 125 points
        await pool.query(
            "INSERT INTO user_points (user_email, delta, reason) VALUES (?, ?, ?)",
            [email, 125, "Welcome bonus for registration"]
        );

        const user = { id: result.insertId, name, email };
        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });

        res.json({ user, token });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Internal server error." });
    }
});

/**
 * Login
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
            return res.status(400).json({ error: "No user found with this email." });
        }
        const userRow = rows[0];

        const ok = await bcrypt.compare(password, userRow.password_hash);
        if (!ok) {
            return res.status(400).json({ error: "Invalid password." });
        }

        const user = { id: userRow.id, name: userRow.name, email: userRow.email };
        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });

        res.json({ user, token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Internal server error." });
    }
});

export default router;
