import React, { useEffect, useState } from 'react';
import { Sparkles, Check, X, Video, Loader2, Crown, ShieldAlert } from 'lucide-react';
import { getMe, startCheckout, openBillingPortal, Me } from '../lib/billing';

const PRO_PRICE = import.meta.env.VITE_PRO_PRICE_LABEL || '£4.99/month';
const CONSULT_PRICE = import.meta.env.VITE_CONSULT_PRICE_LABEL || '£9.99 per session';

const PRO_FEATURES = [
  'Unlimited AI pet expert chat (photos, video & voice notes)',
  'AI breed recognition from a photo',
  'Personalised AI training plans & Expert Q&A answers',
  'AI price comparison & live coupon finder',
  'Nearby vets, groomers & parks found for you',
];

export function VetDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`flex gap-2 text-xs text-[#7C7670] ${className}`}>
      <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
      Pawesome consultations are AI-powered guidance, not a veterinary diagnosis, and are not a substitute for a qualified vet.
      In an emergency, contact your vet or an out-of-hours emergency vet immediately.
    </p>
  );
}

export function ProPlans({ onStartLive }: { onStartLive?: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getMe(true).then(setMe); }, []);

  const go = async (kind: 'pro' | 'consult' | 'portal') => {
    setBusy(kind); setErr(null);
    try { kind === 'portal' ? await openBillingPortal() : await startCheckout(kind); }
    catch (e: any) { setErr(e.message); setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="relative rounded-[32px] p-8 bg-gradient-to-br from-[#5A5A40] to-[#3E3E2C] text-white shadow-xl overflow-hidden">
          <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Crown size={14} className="text-yellow-300" /> Pawesome Pro
          </div>
          <h3 className="mt-4 text-3xl font-serif font-bold">{PRO_PRICE}</h3>
          <p className="text-white/70 text-sm">Cancel any time.</p>
          <ul className="mt-6 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-3 text-sm"><Check size={18} className="text-yellow-300 flex-shrink-0" />{f}</li>
            ))}
          </ul>
          {me?.pro ? (
            <button onClick={() => go('portal')} className="mt-8 w-full bg-white/15 py-3 rounded-2xl font-bold">
              {busy === 'portal' ? <Loader2 className="animate-spin mx-auto" /> : "You're Pro: manage billing"}
            </button>
          ) : (
            <button onClick={() => go('pro')} disabled={!!busy} className="mt-8 w-full bg-white text-[#5A5A40] py-4 rounded-2xl font-bold text-lg hover:shadow-xl active:scale-95 transition-all">
              {busy === 'pro' ? <Loader2 className="animate-spin mx-auto" /> : 'Upgrade to Pro'}
            </button>
          )}
        </div>

        <div className="rounded-[32px] p-8 bg-white border border-[#F0EBE6] shadow-sm">
          <div className="inline-flex items-center gap-2 bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Video size={14} /> Live consultation
          </div>
          <h3 className="mt-4 text-3xl font-serif font-bold text-[#5A5A40]">{CONSULT_PRICE}</h3>
          <p className="text-[#7C7670] text-sm mt-1">
            A live, camera-and-voice session with Pawesome's AI pet expert. Show it your pet, ask anything, get a written summary.
          </p>
          <VetDisclaimer className="mt-4" />
          {me && me.credits > 0 ? (
            <button onClick={onStartLive} className="mt-6 w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold">
              Start session ({me.credits} credit{me.credits === 1 ? '' : 's'} left)
            </button>
          ) : (
            <button onClick={() => go('consult')} disabled={!!busy} className="mt-6 w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:shadow-xl active:scale-95 transition-all">
              {busy === 'consult' ? <Loader2 className="animate-spin mx-auto" /> : 'Book a consultation'}
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-center text-sm text-rose-600">{err}</p>}
      <p className="text-center text-xs text-[#A19B95]">
        Free forever: pet profiles, health diary, feeding tracker, sitter sheet, senior journal, forum, social hub and retailer search.
      </p>
    </div>
  );
}

export default function ProPaywall({ onStartLive }: { onStartLive: () => void }) {
  const [open, setOpen] = useState<null | 'pro' | 'consult'>(null);
  useEffect(() => {
    const h = (e: Event) => setOpen(((e as CustomEvent).detail as 'pro' | 'consult') || 'pro');
    window.addEventListener('pawesome:paywall', h);
    return () => window.removeEventListener('pawesome:paywall', h);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4" onClick={() => setOpen(null)}>
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#FDFCFB] rounded-[40px] p-6 md:p-10" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setOpen(null)} className="absolute right-6 top-6 text-[#A19B95]"><X /></button>
        <div className="text-center mb-8 space-y-2">
          <Sparkles className="mx-auto text-[#5A5A40]" />
          <h2 className="text-3xl font-serif font-bold text-[#5A5A40]">
            {open === 'consult' ? 'Book a live consultation' : 'Unlock Pawesome AI'}
          </h2>
          <p className="text-[#7C7670]">
            {open === 'consult' ? 'Live sessions are booked one at a time.' : 'This feature is part of Pawesome Pro.'}
          </p>
        </div>
        <ProPlans onStartLive={() => { setOpen(null); onStartLive(); }} />
      </div>
    </div>
  );
}
