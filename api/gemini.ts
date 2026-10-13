// Server-side proxy for Gemini. The API key never reaches the browser.
// Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables.
import { GoogleGenAI } from "@google/genai";

const ALLOWED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-pro"]);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { model, contents, config } = body;
    if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: "Model not allowed" });
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents, config });
    return res.status(200).json({ text: response.text ?? "", candidates: response.candidates ?? [] });
  } catch (e: any) {
    console.error("gemini proxy error", e);
    return res.status(500).json({ error: "Gemini request failed" });
  }
}
