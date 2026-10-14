<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1665d66a-9937-4b80-8b74-c55076b9df0a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Free vs Pro

- **Free (no AI cost):** pet profiles, health diary, feeding, sitter sheet, senior journal, forum (keyword moderation), social hub, UK retailer search links, "near me" map links.
- **Pro (Stripe subscription):** all Gemini features via `/api/gemini`, which checks a Firebase ID token + active Stripe subscription and rate limits per user.
- **Live consultation (Stripe one-off):** each paid session = 1 credit; `/api/live-token` consumes a credit. AI guidance only, not a substitute for a vet.

Server env vars: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_CONSULT`, optional `SITE_URL`, `FIREBASE_PROJECT_ID`, `PRO_RATE_PER_MIN` (10), `PRO_RATE_PER_DAY` (150), `CONSULT_SESSION_MINUTES` (20).
Client env vars (optional): `VITE_AMAZON_ASSOCIATE_TAG`, `VITE_AWIN_AFFILIATE_ID`, `VITE_AWIN_MID_ZOOPLUS`, `VITE_AWIN_MID_PETSATHOME`, `VITE_PRO_PRICE_LABEL`, `VITE_CONSULT_PRICE_LABEL`.
No Stripe webhook is required: entitlements are read live from Stripe.
