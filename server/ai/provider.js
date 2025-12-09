// ai/provider.js — Gemini (auto model picking, FULL ENGLISH VERSION)
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
            /* not critical */
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

export async function isHealthy() {
    try {
        if (!model) await pickModel();
        return Boolean(model);
    } catch {
        return false;
    }
}

/* ============================================================
   JSON soft parser (unchanged)
   ============================================================ */
function parseJsonLoose(text = "") {
    const raw = String(text || "").trim();
    if (!raw) return null;

    const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    try { return JSON.parse(cleaned); } catch {}

    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
        try { return JSON.parse(m[0]); } catch {}
    }
    return null;
}

/* ============================================================
   1) RECIPE (ENGLISH VERSION)
   ============================================================ */
export async function generateRecipe({ picked, profile }) {
    return withModel(async (m) => {
        const ingrs = Object.values(picked || {}).flat();
        const ingredients = ingrs.map(x => x.name).join(", ") || "none";
        const preferences = profile?.notes || "no special preferences";

        const estKcal = ingrs.reduce((s, x) => s + (+x.kcal || 0), 0) || 520;

        const recipeSchema = {
            type: "object",
            properties: {
                name:        { type: "string" },
                method:      { type: "string", enum: ["Pan","Oven","Grill","Wok","Boiling"] },
                time_active: { type: "integer", minimum: 0 },
                time_passive:{ type: "integer", minimum: 0 },
                kcal:        { type: "integer", minimum: 0 },
                story:       { type: "string" }
            },
            required: ["name","method","time_active","time_passive","kcal","story"]
        };

        const prompt =
            `You are a professional chef. Generate a RECIPE STRICTLY in JSON (no code blocks).
Rules:
- method: one of ["Pan","Oven","Grill","Wok","Boiling"].
- time_active: minutes of active cooking (cutting, frying, stirring).
- time_passive: minutes of passive waiting (baking, marinating, resting).
- kcal: approximate kcal per serving.
- story: 2–4 short sentences describing the flavor and texture.
- name: short, catchy title.
Ingredients: ${ingredients}.
User preferences: ${preferences}.
If the ingredients are simple — keep the total time around 10–20 minutes.`;

        let text = "";

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
        } catch {}

        if (!text) {
            const gen2 = await m.generateContent(
                prompt + "\nReturn ONLY a JSON object with keys name,method,time_active,time_passive,kcal,story."
            );
            text = (gen2.response?.text?.() || "").trim();
        }

        let r = parseJsonLoose(text);

        const fallback = {
            method: "Pan",
            time_active: 10,
            time_passive: 0,
            kcal: estKcal,
            name: ingrs.length ? (ingrs[0].name + " — chef's pick") : "Home-style Dish",
            story: "A tasty and balanced dish with pleasant texture and a harmonious flavor profile."
        };

        if (!r || typeof r !== "object") r = {};

        const allowed = ["Pan","Oven","Grill","Wok","Boiling"];
        const out = {
            name: (r.name || fallback.name).slice(0, 80),
            method: allowed.includes(r.method) ? r.method : fallback.method,
            time_active: Number.isFinite(+r.time_active) ? Math.max(0, +r.time_active) : fallback.time_active,
            time_passive: Number.isFinite(+r.time_passive) ? Math.max(0, +r.time_passive) : fallback.time_passive,
            kcal: Number.isFinite(+r.kcal) ? Math.max(0, +r.kcal) : fallback.kcal,
            story: String(r.story || fallback.story).trim()
        };

        if (!text || !r.name) {
            console.warn("[AI] fallback used. raw:", text?.slice(0, 200));
        }

        return out;
    });
}

/* ============================================================
   2) HINT (ENGLISH VERSION)
   ============================================================ */
export async function generateHint({ picked }) {
    return withModel(async (m) => {
        const ingredients = Object.values(picked || {}).flat().map(x => x.name).join(", ") || "empty";
        const prompt =
            `Give one short cooking tip in ENGLISH (max 15 words) to improve the dish.
Ingredients: ${ingredients}.
No introduction, only the tip.`;

        try {
            const res = await m.generateContent(prompt);
            const t = (res.response?.text?.() || "").trim();
            return { hint: t || "Add a bit of acidity (lemon/vinegar) to balance the flavor." };
        } catch {
            return { hint: "Add a bit of acidity (lemon/vinegar) to balance the flavor." };
        }
    });
}

/* ============================================================
   3) AI-CHEF (ENGLISH VERSION)
   ============================================================ */
export async function generateAiChefDish({ taste }) {
    return withModel(async (m) => {
        const {
            diet = "regular",
            cuisines = [],
            budget = null,
            time = null,
            sliders = {},
            allergens = "",
            notes = "",
            gear = [],
        } = taste || {};

        const estTime = time || 25;

        const sliderDesc = `
Spice level (1–5): ${sliders.spice ?? 1}
Sweetness (1–5): ${sliders.sweet ?? 1}
Saltiness (1–5): ${sliders.salt ?? 1}
Acidity (1–5): ${sliders.acid ?? 1}
`;

        const dietText = diet === "vegetarian" ? "vegetarian" :
            diet === "vegan" ? "vegan" :
                diet === "gluten-free" ? "gluten-free" :
                    diet === "keto" ? "keto" :
                        "regular";

        const cuisinesText = cuisines.length ? cuisines.join(", ") : "any cuisine";
        const allergensText = allergens || "no allergens specified";
        const gearText = gear.length ? gear.join(", ") : "basic stove & cookware";
        const userNotes = notes || "no additional user notes";

        const recipeSchema = {
            type: "object",
            properties: {
                name:        { type: "string" },
                summary:     { type: "string" },
                time:        { type: "integer", minimum: 1 },
                difficulty:  { type: "string" },
                kcal:        { type: "integer", minimum: 0 },
                fitScore:    { type: "integer", minimum: 0, maximum: 100 },
                image:       { type: "string" },
                price:       { type: "number", minimum: 0 },
                ingredients: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 4,
                },
                steps: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 3,
                },
                explanation: { type: "string" },
            },
            required: ["name","summary","time","difficulty","kcal","fitScore","ingredients","steps"],
        };

        const prompt = `
You are the head chef of TammyFood.

TASK: Suggest ONE main dish that best fits the user's preferences.

RESPONSE FORMAT: STRICTLY 1 JSON OBJECT (no comments, no code blocks).

Fields:
- name: short dish name in English.
- summary: 1–3 sentences (flavor, mood, for whom it suits).
- time: total preparation time in minutes (active + passive), respect user's preferred time if set.
- difficulty: "Easy", "Medium", or "Hard".
- kcal: approximate calories per serving.
- fitScore: 0–100 — how well the dish fits the user's taste profile.
- image: short description for future image generation (optional).
- price: estimated cost per serving in dollars. 
  If user budget is set, price MUST be <= budget.
- ingredients: list of strings "Name — amount" (must respect diet + allergens).
- steps: cooking steps, simple and clear.
- explanation: 2–4 sentences why this dish fits the user's preferences.

Conditions:
- Diet: ${dietText}.
- Preferred cuisines: ${cuisinesText}.
- Budget per serving: ${budget ? budget + " $" : "not specified, but avoid overly expensive dishes"}.
- Preferred cooking time: ${time ? time + " min" : "about " + estTime + " min"}.
- Allergens: ${allergensText}.
- Available equipment: ${gearText}.
- User notes: ${userNotes}.

Taste sliders:
${sliderDesc}

Important:
- Do NOT include any ingredients that obviously contain listed allergens.
- Adjust spiciness/sweetness/saltiness/acidity according to sliders.
- If user wants “something light” → avoid heavy sauces.
- Focus on ONE main dish, not a set.
`;

        let text = "";

        try {
            const gen1 = await m.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: recipeSchema,
                    maxOutputTokens: 450,
                },
            });
            text = (gen1.response?.text?.() || "").trim();
        } catch {}

        if (!text) {
            const gen2 = await m.generateContent(
                prompt +
                "\nReturn ONLY one JSON object with keys name,summary,time,difficulty,kcal,fitScore,image,ingredients,steps,explanation."
            );
            text = (gen2.response?.text?.() || "").trim();
        }

        let r = parseJsonLoose(text);

        const fallback = {
            name: "Light TammyFood Bowl",
            summary: "A gentle, balanced dish without heavy sauces — perfect for a quick meal.",
            time: estTime,
            difficulty: "Easy",
            kcal: 520,
            fitScore: 88,
            image: "",
            ingredients: [
                "Rice or quinoa — 80–100 g",
                "Seasonal vegetables — 150 g",
                "Light dressing with olive oil and lemon",
                "Salt and pepper to taste",
            ],
            steps: [
                "Cook the base (rice/quinoa) until ready.",
                "Chop and lightly sauté or steam the vegetables.",
                "Mix with the base, add dressing and seasonings.",
            ],
            explanation:
                "The dish is universal, allergen-safe, and matches most taste sliders and user preferences.",
        };

        if (!r || typeof r !== "object") r = {};
        const maxTime = time || estTime;
        const out = {
            name: String(r.name || fallback.name).slice(0, 80),
            summary: String(r.summary || fallback.summary).trim(),
            time: (() => {
                const raw = Number(r.time);
                if (Number.isFinite(raw)) {
                    const t = Math.max(1, raw);
                    return maxTime ? Math.min(maxTime, t) : t;  // 👈 НЕ БІЛЬШЕ ЗАДАНОГО
                }
                return fallback.time;
            })(),
            difficulty: r.difficulty || fallback.difficulty,
            kcal: Number.isFinite(+r.kcal) ? Math.max(0, +r.kcal) : fallback.kcal,
            fitScore: Number.isFinite(+r.fitScore)
                ? Math.min(100, Math.max(0, +r.fitScore))
                : fallback.fitScore,
            image: r.image || fallback.image,
            price: (() => {                                  // 👈 НОВЕ
                const raw = Number(r.price);
                if (Number.isFinite(raw) && raw >= 0) {
                    if (budget) return Math.min(budget, raw);
                    return raw;
                }
                return budget || 10; // проста заглушка
            })(),
            ingredients: Array.isArray(r.ingredients) && r.ingredients.length
                ? r.ingredients.map(String)
                : fallback.ingredients,
            steps: Array.isArray(r.steps) && r.steps.length
                ? r.steps.map(String)
                : fallback.steps,
            explanation: String(r.explanation || fallback.explanation).trim(),
        };

        if (!text || !r.name) {
            console.warn("[AI-CHEF] fallback/partial used. raw:", text?.slice(0, 200));
        }

        return out;
    });
}
/* ============================================================
   4) INGREDIENT REPLACEMENT (ENGLISH VERSION)
   ============================================================ */
export async function generateIngredientAlternatives({
                                                         ingredient,
                                                         recipeName = "",
                                                         taste = {},
                                                         allergens = "",
                                                         ingredients = [],
                                                     }) {
    return withModel(async (m) => {
        const {
            diet = "regular",
            cuisines = [],
            sliders = {},
            budget = null,
            notes = "",
            gear = [],
        } = taste || {};

        const dietText = diet === "vegetarian" ? "vegetarian" :
            diet === "vegan" ? "vegan" :
                diet === "gluten-free" ? "gluten-free" :
                    diet === "keto" ? "keto" :
                        "regular";

        const cuisinesText  = cuisines.length ? cuisines.join(", ") : "any cuisine";
        const allergensText = allergens || taste.allergens || "no allergens specified";
        const gearText      = gear.length ? gear.join(", ") : "basic stove & cookware";
        const userNotes     = notes || taste.notes || "no additional user notes";

        const sliderDesc = `
Spice level (1–5): ${sliders.spice ?? 1}
Sweetness (1–5): ${sliders.sweet ?? 1}
Saltiness (1–5): ${sliders.salt ?? 1}
Acidity  (1–5): ${sliders.acid  ?? 1}
`;

        const currentList = (ingredients || []).join(", ") || "not specified";

        const altSchema = {
            type: "object",
            properties: {
                alternatives: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    maxItems: 6,
                },
            },
            required: ["alternatives"],
        };

        const prompt = `
You are an expert chef for TammyFood.

TASK:
Suggest several alternative ingredients that can replace ONE ingredient
in a recipe while keeping the dish tasty and coherent.

Current ingredient to replace: "${ingredient}"
Recipe name (if any): ${recipeName || "not specified"}
Other ingredients in the recipe: ${currentList}

User constraints:
- Diet: ${dietText}
- Preferred cuisines: ${cuisinesText}
- Allergens: ${allergensText}
- Available equipment: ${gearText}
- User notes: ${userNotes}

Taste sliders (1–5):
${sliderDesc}

Very important rules:

1) FORMAT
- Each alternative MUST follow the SAME style as other recipe ingredients.
  Example formats:
    "Tofu — 150 g"
    "Zucchini — 1 cup sliced"
    "Brown rice — 80–100 g"
- Always include an amount or serving size if it makes sense.
- The replacement must look natural in the list next to other ingredients.

2) DIET / ALLERGENS / CONTEXT
- All alternatives MUST respect the diet and avoid obvious allergens.
- Keep the same general technique (stir-fry, oven, etc.).
- Maintain the spirit of the dish (do not turn a stir-fry into a soup, etc.).
- Prefer common, widely available supermarket ingredients (no exotic, hard-to-find items).

3) NO TRIVIAL SUBSTITUTIONS
- Do NOT suggest trivial variants of the same ingredient, such as:
    - black pepper → white pepper
    - garlic → garlic powder
    - olive oil → vegetable oil
    - "fresh parsley" → "flat-leaf parsley"
- Avoid simply changing adjectives ("fresh", "smoked", "low-sodium" etc.) without changing the core product.
- The core ingredient should change (e.g. chicken → tofu / turkey / shrimp).

4) QUANTITY
- When possible, keep a realistic amount for the replacement
  that matches the role of the original ingredient in the recipe.

5) HOW MANY
- Suggest 2–4 reasonable replacements.

RESPONSE FORMAT:
Return STRICTLY ONE JSON object:
{"alternatives":["...","..."]}
No code blocks, no comments.`;

        let text = "";

        try {
            const gen1 = await m.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: altSchema,
                    maxOutputTokens: 200,
                },
            });
            text = (gen1.response?.text?.() || "").trim();
        } catch {}

        if (!text) {
            const gen2 = await m.generateContent(
                prompt + "\nReturn ONLY a JSON object with key \"alternatives\"."
            );
            text = (gen2.response?.text?.() || "").trim();
        }

        let parsed = parseJsonLoose(text) || {};
        let list = [];

        if (Array.isArray(parsed)) {
            list = parsed;
        } else if (Array.isArray(parsed.alternatives)) {
            list = parsed.alternatives;
        }

        // ---------- нормалізація + анти-брєд ----------

        const original = String(ingredient || "").trim();

        const normalizeName = (s) => {
            return String(s || "")
                .toLowerCase()
                .replace(/—.*$/,"")
                .replace(/[-(),]/g," ")
                .replace(/\b(fresh|dried|low-sodium|smoked|ground|chopped|minced|optional|for garnish|to taste|taste|medium|large|small)\b/g, "")
                .replace(/\s+/g," ")
                .trim();
        };

        const originalNorm = normalizeName(original);

        const [origNamePart, origRestRaw] = original.split(/—|-/);
        const origSuffix = (origRestRaw || "").trim(); // "1 lb (about 450g)"

        list = (list || [])
            .map((v) => String(v || "").trim())
            .filter((v) => v && !/^alternative\s*\d*/i.test(v))
            // прибираємо дублікати
            .filter((v, i, arr) => arr.indexOf(v) === i)
            // прибираємо тривіальні заміни (те ж саме ядро)
            .filter((v) => normalizeName(v) && normalizeName(v) !== originalNorm)
            // додаємо кількість, якщо її немає, але була у вихідному інгредієнті
            .map((v) => {
                const hasDash = /—|-/.test(v);
                if (!hasDash && origSuffix) {
                    const cleanName = v.replace(/—.*$/,"").trim();
                    return `${cleanName} — ${origSuffix}`;
                }
                return v;
            });

        // Fallback – хоча б щось адекватне
        if (!list.length) {
            const base = original.toLowerCase();
            if (base.includes("cheese")) list = ["Feta — 40 g", "Mozzarella — 40 g", "Firm tofu — 50 g"];
            else if (base.includes("chicken")) list = ["Turkey breast — same amount", "Firm tofu — same amount", "Mushrooms — same amount"];
            else if (base.includes("cream")) list = ["Coconut milk — same volume", "Oat cream — same volume"];
            else list = [original];
        }

        return { alternatives: list };
    });
}
