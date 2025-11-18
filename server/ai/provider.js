// ai/provider.js — Gemini (автовибір моделі)
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("[AI] ⚠️ GEMINI_API_KEY is missing — AI disabled");
}

let model = null;
let modelName = null;

export async function pickModel() {
    if (!apiKey) return null;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        const preferred = process.env.GEMINI_MODEL?.trim();
        const fallbacks = [
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-1.0-pro",
            "gemini-pro"
        ];

        const candidates = preferred ? [preferred, ...fallbacks] : fallbacks;

        let available = [];
        try {
            const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey);

            if (res.ok) {
                const { models } = await res.json();
                available = (models || [])
                    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
                    .map(m => m.name.replace(/^models\//, ""));
            }
        } catch {
            /* не критично */
        }

        const lineup = [...candidates, ...available];

        for (const name of lineup) {
            try {
                const m = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: name });
                await m.generateContent({ contents: [{ role: "user", parts: [{ text: "ping" }] }] });
                model = m;
                modelName = name;
                console.log("[AI] ✅ Using model:", name);
                return model;
            } catch (err) {
                console.log("[AI] Model not available:", name, "→", err?.status || err?.message || "error");
            }
        }

        console.error("[AI] ❌ No suitable Gemini model found for this API key.");
        return null;
    } catch (e) {
        console.error("[AI] ❌ Failed to init Gemini:", e.message);
        return null;
    }
}


async function withModel(fn) {
    if (!model) await pickModel();
    if (!model) throw new Error("Gemini model unavailable");
    return fn(model);
}

// ---- health ----
export async function isHealthy() {
    try {
        if (!model) await pickModel();
        return Boolean(model);
    } catch {
        return false;
    }
}

// ---- recipe ----
// ---- recipe ----
// ---- recipe ----
// ---- recipe ----
// helper: м’який парсер JSON
function parseJsonLoose(text = "") {
    const raw = String(text || "").trim();
    if (!raw) return null;

    // прибираємо ```json ... ``` та зайві пробіли
    const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    // якщо це валідний JSON-об’єкт — парсимо
    try { return JSON.parse(cleaned); } catch {}

    // пробуємо вирізати найближчий об’єкт {...}
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
        try { return JSON.parse(m[0]); } catch {}
    }
    return null;
}

// ---- recipe ----
export async function generateRecipe({ picked, profile }) {
    return withModel(async (m) => {
        const ingrs = Object.values(picked || {}).flat();
        const ingredients = ingrs.map(x => x.name).join(", ") || "немає";
        const preferences = profile?.notes || "без особливих побажань";

        // оцінимо ккал і підкажемо дефолтні часи як останній fallback
        const estKcal = ingrs.reduce((s, x) => s + (+x.kcal || 0), 0) || 520;

        const recipeSchema = {
            type: "object",
            properties: {
                name:        { type: "string" },
                method:      { type: "string", enum: ["Пательня","Духовка","Гриль","Вок","Варіння"] },
                time_active: { type: "integer", minimum: 0 },
                time_passive:{ type: "integer", minimum: 0 },
                kcal:        { type: "integer", minimum: 0 },
                story:       { type: "string" }
            },
            required: ["name","method","time_active","time_passive","kcal","story"]
        };

        const prompt =
            `Ти шеф-кухар. Згенеруй рецепт СТРОГО у JSON (без код-блоків).
Правила:
- method: одна з ["Пательня","Духовка","Гриль","Вок","Варіння"].
- time_active: активні хвилини (різання/смаження/мішання).
- time_passive: пасивні хвилини (очікування/запікання/маринування).
- kcal: приблизні ккал на порцію.
- story: 2–4 лаконічні речення про смак/текстуру.
- name: коротка назва.
Інгредієнти: ${ingredients}.
Побажання: ${preferences}.
Якщо інгредієнтів небагато — тримай сумарний час у межах 10–20 хв.`;

        let text = "";
        // 1) спроба зі схемою (деякі моделі вже її розуміють)
        try {
            const gen1 = await m.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: recipeSchema,
                    maxOutputTokens: 300
                }
            });
            text = (gen1.response?.text?.() || "").trim();
        } catch (e) {
            // пропускаємо до retry
        }

        // 2) retry — без schema, але з дуже чіткою інструкцією
        if (!text) {
            const gen2 = await m.generateContent(
                prompt + "\nПоверни ТІЛЬКИ JSON-об'єкт з ключами name,method,time_active,time_passive,kcal,story."
            );
            text = (gen2.response?.text?.() || "").trim();
        }

        // 3) надійний парсинг
        let r = parseJsonLoose(text);

        // 4) fallback, якщо модель знову «пожартувала»
        const fallback = {
            method: "Пательня",
            time_active: 10,
            time_passive: 0,
            kcal: estKcal,
            name: ingrs.length ? (ingrs[0].name + " — шеф подає") : "Домашня страва",
            story: "Смачна та збалансована страва з приємною текстурою та гармонією смаку."
        };

        // якщо взагалі нічого не розпарсили — віддаємо fallback і не ламаємо фронт
        if (!r || typeof r !== "object") r = {};

        const allowed = ["Пательня","Духовка","Гриль","Вок","Варіння"];
        const out = {
            name: (r.name || fallback.name).slice(0, 80),
            method: allowed.includes(r.method) ? r.method : fallback.method,
            time_active: Number.isFinite(+r.time_active) ? Math.max(0, +r.time_active) : fallback.time_active,
            time_passive: Number.isFinite(+r.time_passive) ? Math.max(0, +r.time_passive) : fallback.time_passive,
            kcal: Number.isFinite(+r.kcal) ? Math.max(0, +r.kcal) : fallback.kcal,
            story: String(r.story || fallback.story).trim()
        };

        // (необов’язково) зручний лог, щоб бачити, що саме прийшло від моделі
        if (!text || !r.name) {
            console.warn("[AI] fallback used. raw:", text?.slice(0, 200));
        }

        return out;
    });
}

// ---- hint ----  (ЗАЛИШ одна цю функцію, другу видали!)
export async function generateHint({ picked }) {
    return withModel(async (m) => {
        const ingredients = Object.values(picked || {}).flat().map(x => x.name).join(", ") || "порожньо";
        const prompt =
            `Дай одну коротку пораду українською (до 15 слів), як зробити страву смачнішою або збалансованішою.
Склад: ${ingredients}.
Без вступу, тільки сама порада.`;

        try {
            const res = await m.generateContent(prompt);
            const t = (res.response?.text?.() || "").trim();
            return { hint: t || "Додайте трохи кислотності (лимон/оцет) для балансу смаку." };
        } catch {
            return { hint: "Додайте трохи кислотності (лимон/оцет) для балансу смаку." };
        }
    });
}
