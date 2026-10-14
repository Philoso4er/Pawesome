// POST → { url } Stripe Billing Portal (manage / cancel Pro)
import { getUser } from "./_lib/auth.js";
import { stripe, findCustomer } from "./_lib/billing.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(503).json({ error: "Payments are not configured yet" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  const c = await findCustomer(user.uid);
  if (!c) return res.status(404).json({ error: "No billing account yet" });
  const origin = process.env.SITE_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const s = await stripe.billingPortal.sessions.create({ customer: c.id, return_url: origin });
  return res.status(200).json({ url: s.url });
}
