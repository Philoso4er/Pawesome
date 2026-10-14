// Verifies Firebase ID tokens (Google sign-in) without a service account.
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "pawesome-7f70b";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export interface AuthedUser { uid: string; email?: string }

export async function getUser(req: any): Promise<AuthedUser | null> {
  const h = req.headers?.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (!payload.sub) return null;
    return { uid: payload.sub, email: (payload as any).email };
  } catch {
    return null;
  }
}
