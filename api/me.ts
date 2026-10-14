// GET → { signedIn, pro, credits, billingConfigured }
import { getUser } from "./_lib/auth.js";
import { getEntitlement, stripe } from "./_lib/billing.js";

export default async function handler(req: any, res: any) {
  const user = await getUser(req);
  if (!user) return res.status(200).json({ signedIn: false, pro: false, credits: 0, billingConfigured: !!stripe });
  const fresh = req.query?.fresh === "1";
  const ent = await getEntitlement(user.uid, fresh).catch(() => ({ pro: false, credits: 0 }));
  return res.status(200).json({ signedIn: true, pro: ent.pro, credits: ent.credits, billingConfigured: !!stripe });
}
