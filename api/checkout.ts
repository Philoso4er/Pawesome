// POST { kind: "pro" | "consult", quantity? } → { url } (Stripe-hosted Checkout)
import { getUser } from "./_lib/auth.js";
import { stripe, getOrCreateCustomer, invalidate } from "./_lib/billing.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(503).json({ error: "Payments are not configured yet" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const kind = body.kind === "consult" ? "consult" : "pro";
  const price = kind === "pro" ? process.env.STRIPE_PRICE_PRO_MONTHLY : process.env.STRIPE_PRICE_CONSULT;
  if (!price) return res.status(503).json({ error: `Missing ${kind === "pro" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_CONSULT"}` });
  const quantity = kind === "consult" ? Math.min(Math.max(Number(body.quantity) || 1, 1), 5) : 1;

  const origin = process.env.SITE_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  try {
    const customer = await getOrCreateCustomer(user.uid, user.email);
    const session = await stripe.checkout.sessions.create({
      mode: kind === "pro" ? "subscription" : "payment",
      customer: customer.id,
      line_items: [{ price, quantity }],
      allow_promotion_codes: true,
      metadata: { kind, quantity: String(quantity), firebase_uid: user.uid },
      client_reference_id: user.uid,
      success_url: `${origin}/?checkout=success&kind=${kind}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    invalidate(user.uid);
    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error", e?.message);
    return res.status(500).json({ error: "Could not start checkout" });
  }
}
