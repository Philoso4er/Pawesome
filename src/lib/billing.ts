// Client helpers for Pawesome Pro (Stripe) and paid consultations.
import { auth } from '../firebase';

export interface Me { signedIn: boolean; pro: boolean; credits: number; billingConfigured: boolean }

export class ProRequiredError extends Error {
  constructor(public kind: 'pro' | 'consult' = 'pro') { super(kind === 'pro' ? 'Pawesome Pro required' : 'Book a consultation to start a live session'); }
}

export async function authedFetch(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

let meCache: { at: number; v: Me } | null = null;
const listeners = new Set<(m: Me) => void>();

export async function getMe(fresh = false): Promise<Me> {
  if (!fresh && meCache && Date.now() - meCache.at < 60_000) return meCache.v;
  try {
    const r = await authedFetch(`/api/me${fresh ? '?fresh=1' : ''}`);
    const v = (await r.json()) as Me;
    meCache = { at: Date.now(), v };
    listeners.forEach((l) => l(v));
    return v;
  } catch {
    return meCache?.v || { signedIn: false, pro: false, credits: 0, billingConfigured: false };
  }
}

export function onMe(cb: (m: Me) => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function openPaywall(kind: 'pro' | 'consult' = 'pro') {
  window.dispatchEvent(new CustomEvent('pawesome:paywall', { detail: kind }));
}

export async function startCheckout(kind: 'pro' | 'consult', quantity = 1) {
  const r = await authedFetch('/api/checkout', { method: 'POST', body: JSON.stringify({ kind, quantity }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || 'Could not start checkout');
  window.location.assign(j.url);
}

export async function openBillingPortal() {
  const r = await authedFetch('/api/portal', { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || 'Could not open billing');
  window.location.assign(j.url);
}
