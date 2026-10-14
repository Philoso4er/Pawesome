// Stripe is the single source of truth for entitlements (no database needed):
//  - Pro = an active/trialing subscription on the customer tagged with the Firebase uid
//  - Consultation credits = paid "consult" Checkout sessions × quantity − metadata.consult_used
import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export interface Entitlement { pro: boolean; credits: number; customerId: string | null }

const cache = new Map<string, { at: number; v: Entitlement }>();
const TTL = 60_000;

export async function findCustomer(uid: string): Promise<Stripe.Customer | null> {
  if (!stripe) return null;
  const r = await stripe.customers.search({ query: `metadata['firebase_uid']:'${uid.replace(/'/g, "")}'`, limit: 1 });
  return (r.data[0] as Stripe.Customer) || null;
}

export async function getOrCreateCustomer(uid: string, email?: string): Promise<Stripe.Customer> {
  const existing = await findCustomer(uid);
  if (existing) return existing;
  // Search is eventually consistent; list-by-email is not, so check it too to avoid duplicates.
  if (email) {
    const byEmail = await stripe!.customers.list({ email, limit: 10 });
    const match = byEmail.data.find((c) => c.metadata?.firebase_uid === uid);
    if (match) return match;
  }
  return stripe!.customers.create({ email, metadata: { firebase_uid: uid } });
}

export function invalidate(uid: string) { cache.delete(uid); }

export async function getEntitlement(uid: string, fresh = false): Promise<Entitlement> {
  const hit = cache.get(uid);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.v;
  const none: Entitlement = { pro: false, credits: 0, customerId: null };
  if (!stripe) return none;
  const c = await findCustomer(uid);
  if (!c) { cache.set(uid, { at: Date.now(), v: none }); return none; }

  const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
  const pro = subs.data.some((s) => s.status === "active" || s.status === "trialing");

  let bought = 0;
  for await (const s of stripe.checkout.sessions.list({ customer: c.id, limit: 100 })) {
    if (s.metadata?.kind === "consult" && s.payment_status === "paid") bought += Number(s.metadata?.quantity || 1);
  }
  const used = Number(c.metadata?.consult_used || 0);
  const v = { pro, credits: Math.max(0, bought - used), customerId: c.id };
  cache.set(uid, { at: Date.now(), v });
  return v;
}

export async function consumeCredit(uid: string): Promise<boolean> {
  const ent = await getEntitlement(uid, true);
  if (!ent.customerId || ent.credits < 1) return false;
  const c = (await stripe!.customers.retrieve(ent.customerId)) as Stripe.Customer;
  await stripe!.customers.update(ent.customerId, {
    metadata: { consult_used: String(Number(c.metadata?.consult_used || 0) + 1) },
  });
  invalidate(uid);
  return true;
}
