# Evently Backend

NestJS + PostgreSQL (Neon) API for the Evently event discovery and ticketing platform.

## Stack
- NestJS + TypeScript
- Prisma ORM → PostgreSQL (Neon free tier)
- JWT auth (access + refresh) over phone OTP
- Cloudinary (free tier) for private ID-card/selfie storage
- Stripe **test mode** for payments (free, no real charges)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a free Neon Postgres database**
   - Sign up at https://neon.tech, create a project
   - Copy the pooled connection string it gives you

3. **Create your `.env`**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `DATABASE_URL` — from Neon
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `QR_SIGNING_SECRET` — generate with `openssl rand -hex 32` (run three times for three different values)
   - `CLOUDINARY_*` — free account at https://cloudinary.com, keys are on your dashboard
   - `STRIPE_SECRET_KEY` — **test mode** key from https://dashboard.stripe.com/test/apikeys (starts with `sk_test_`)
   - `STRIPE_WEBHOOK_SECRET` — see below

4. **Generate the Prisma client and run the first migration**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Run it**
   ```bash
   npm run start:dev
   ```
   API is served at `http://localhost:3000/api/v1`.

## Testing Stripe webhooks locally

Stripe needs a public URL (or the Stripe CLI) to send webhooks to your machine:

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

This prints a webhook signing secret starting with `whsec_` — put that in `STRIPE_WEBHOOK_SECRET`.

## Creating your first admin

There's no public signup path for `ADMIN` — a new user can only self-assign `ATTENDEE` or `CREATOR`. To review creator verifications, promote a user directly in the database once they've signed up once via OTP:

```bash
npx prisma studio
```
Open the `User` table, find your user, change `role` to `ADMIN`, save.

## OTP delivery (dev mode)

No SMS provider is wired up yet — the OTP code is printed to the server console when `/auth/send-otp` is called, so you can log in during development without paying for SMS. Swap the `console.log` in `src/auth/auth.service.ts` for a real provider (Twilio, Vonage, etc.) when you're ready to ship.

## Known limitations to revisit later
- **Creator identity verification is manual**, not automated biometric matching — this was a deliberate choice to stay free-tier (real KYC APIs are paid). The pipeline (upload → pending → admin approve/reject) is fully wired, so plugging in an automated pre-check later (e.g. AWS Rekognition's 12-month free tier) is additive, not a rewrite.
- **Geo search uses haversine distance** computed in application code after a bounding-box SQL filter, not PostGIS. Fine at moderate scale; revisit if the events table gets large.
- **No push notifications yet** — `firebase_messaging` is already a dependency in the Flutter app but nothing on this backend sends anything yet.

## API overview

| Module | Base path |
|---|---|
| Auth | `/api/v1/auth` |
| Users | `/api/v1/users` |
| Verification | `/api/v1/verification` |
| Events | `/api/v1/events` |
| Ticket tiers | `/api/v1/events/:eventId/ticket-tiers` |
| Orders | `/api/v1/orders` |
| Tickets | `/api/v1/tickets` |
| Check-in | `/api/v1/checkin` |
| Dashboard | `/api/v1/creator/dashboard` |
| Stripe webhook | `/api/v1/webhooks/stripe` |
