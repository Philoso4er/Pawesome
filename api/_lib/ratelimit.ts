// Simple per-user limits for cost control. In-memory per serverless instance,
// so they are best-effort; caps are deliberately conservative.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, perMinute: number, perDay: number): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 86_400_000);
  const lastMinute = arr.filter((t) => now - t < 60_000).length;
  if (lastMinute >= perMinute) return { ok: false, retryAfter: 60 };
  if (arr.length >= perDay) return { ok: false, retryAfter: 3600 };
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return { ok: true };
}
