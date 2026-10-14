// Server-side Gemini proxy — Pro subscribers only, rate limited.
// The API key never reaches the browser (set GEMINI_API_KEY in Vercel).
import { GoogleGenAI } from "@google/genai";
import { getUser } from "./_lib/auth.js";
import { getEntitlement } from "./_lib/billing.js";
import { rateLimit } from "./_lib/ratelimit.js";

const ALLOWED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-pro"]);
const PER_MIN = Number(process.env.PRO_RATE_PER_MIN || 10);
const PER_DAY = Number(process.env.PRO_RATE_PER_DAY || 150);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  const ent = await getEntitlement(user.uid).catch(() => null);
  if (!ent?.pro) return res.status(402).json({ error: "pro_required" });
  const rl = rateLimit(user.uid, PER_MIN, PER_DAY);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "You're going a bit fast — please try again shortly." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let { model, contents, config } = body;
    if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: "Model not allowed" });
    if (JSON.stringify(contents || "").length > 8_000_000) return res.status(413).json({ error: "Attachment too large" });
    config = { ...(config || {}), maxOutputTokens: Math.min(Number(config?.maxOutputTokens) || 4096, 4096) };
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents, config });
    return res.status(200).json({ text: response.text ?? "", candidates: response.candidates ?? [] });
  } catch (e: any) {
    console.error("gemini proxy error", e?.status, e?.message);
    return res.status(502).json({ error: "AI is busy right now, please try again." });
  }
}
