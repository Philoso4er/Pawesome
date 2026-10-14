// Issues a short-lived single-use Gemini Live token for a PAID consultation.
// Consumes one consultation credit per session.
import { GoogleGenAI } from "@google/genai";
import { getUser } from "./_lib/auth.js";
import { consumeCredit } from "./_lib/billing.js";
import { rateLimit } from "./_lib/ratelimit.js";

const SESSION_MINUTES = Number(process.env.CONSULT_SESSION_MINUTES || 20);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  if (!rateLimit(`live:${user.uid}`, 2, 10).ok) return res.status(429).json({ error: "Too many sessions, try later" });

  try {
    if (!(await consumeCredit(user.uid))) return res.status(402).json({ error: "consult_required" });
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + SESSION_MINUTES * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    return res.status(200).json({ token: token.name, minutes: SESSION_MINUTES });
  } catch (e: any) {
    console.error("live-token error", e?.message);
    return res.status(500).json({ error: "Could not create live session token" });
  }
}
