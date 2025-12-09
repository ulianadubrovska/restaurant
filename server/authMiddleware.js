// server/authMiddleware.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_TAMMYFOOD";

export function requireAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");

    if (!token) {
        return res.status(401).json({ error: "Authorization required." });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: payload.id, email: payload.email };
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid token." });
    }
}
