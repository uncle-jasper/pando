@AGENTS.md

# Pando — project handoff

Personal newsletter drafting/management/delivery tool for Dan Benson (danbenson.me). Single-owner
admin app — one person (Dan) logs in and sends to his own subscriber list. Not multi-tenant.

**Live at:** https://pando.danbenson.me (Vercel project `pando` under `uncle-jaspers-projects`).
**Repo:** github.com/uncle-jasper/pando (branch `main`, auto-deploys to production on push).

## Where this came from

Forked from a separate project called **tree** (a distraction-free markdown editor), which lives
at the sibling directory `../tree`. Tree must never be modified — treat it as read-only reference.
The CodeMirror 6 editor (`public/cm6.js`, `components/Editor.tsx`), the hand-rolled markdown
parser (`lib/markdown/parse.ts`), and some UI/theme patterns were copied and adapted from tree's
`index.html`. See the original plan doc in this session's history for exact line references if
you need to re-check fidelity to the source.

Branding (colors, font) was sampled live from danbenson.me's own WordPress theme ("minimalio") in
both light and dark mode — see Settings → Branding. It's a genuinely monochrome palette
(Inconsolata monospace, no accent color) — that's intentional, not a placeholder.

## Stack

- **Next.js 16** (App Router, TypeScript), deployed on **Vercel** (Hobby/free plan)
- **Postgres via Neon**, accessed with **Drizzle ORM** (`lib/schema.ts`, `lib/db.ts`)
- **Resend** for email sending (domain `pando.danbenson.me` is DKIM/SPF/DMARC-verified)
- **Vercel Blob** for image storage (1GB free tier — see Images admin page for usage)
- Single-owner auth: bcrypt password hash + iron-session cookie, no auth provider

## IMPORTANT: shared database between local dev and production

`.env.local`'s `DATABASE_URL` points at the **same live Neon database production uses**. There is
no separate dev/staging database. Local `npm run dev` reads and writes real user data (real
campaign drafts, real subscribers, real uploaded images). Be careful:

- Never run destructive test scripts without scoping them to specific IDs you created
- Clean up any test rows/blobs you create during testing (campaigns, subscribers, images) —
  see git history in this repo's early commits for the pattern (direct `node -e` scripts using
  `@neondatabase/serverless` and `@vercel/blob`'s `del()`)
- If you need to log in locally to test the UI and don't know the real admin password: you can
  temporarily swap `ADMIN_PASSWORD_HASH` in `.env.local` for a hash of a known test password
  (generate one with `node scripts/hash-password.mjs "some-password"`), restart `npm run dev`,
  test, then **restore the real hash and restart again**. Never leave a test hash in place.

## Gotchas learned the hard way

- **bcrypt hashes in `.env.local` need `$` escaped as `\$`.** Next.js's env loader
  (`@next/env`) does variable interpolation on `$...` sequences, silently mangling bcrypt hashes
  (which are full of `$`) unless escaped. Vercel's dashboard env vars do NOT have this problem —
  only local `.env.local` files loaded by Next.js do.
- **Vercel serverless functions cap request bodies at ~4.5MB.** This silently broke image
  uploads (gallery uploads especially) before we added client-side resize/compress
  (`lib/client-image-resize.ts`) ahead of every upload. Don't remove that without understanding
  why it's there — a failed upload from this limit shows no server-side log line at all (the
  platform rejects it before invoking the function), which makes it look like a mystery bug.
- **Vercel Blob free tier is 1GB storage / 10GB transfer per month.** The Images admin page
  (`/admin/images`) shows live usage. Client-side image compression keeps this sustainable.
- **Resend free tier caps at 100 emails/day.** `lib/sendCampaign.ts` batches sends (90/batch,
  8 concurrent) and a daily Vercel Cron (`vercel.json`, `/api/cron/send-batches`) continues any
  campaign still in `sending` status the next day. If Dan ever upgrades Resend, just raise
  `SEND_BATCH_SIZE` in that file — no architecture change needed.
- **`deriveTitle()`** (`lib/markdown/parse.ts`) matches any heading level, falling back to the
  first non-empty line. It used to only match H1, which froze campaign titles as stale text
  whenever someone's first heading was H2+ (a real bug that shipped and got fixed).

## User's standing preference: stay free as long as possible

Explicit instruction: optimize every decision toward staying on free tiers (Vercel Hobby, Neon
free, Resend free, Vercel Blob free) for as long as sustainable. Only reach for a paid tier when
genuinely necessary, and flag it clearly when that point arrives rather than assuming it's fine.

## Known outstanding work (not yet done)

- **Settings → From email is currently wrong.** It needs to be `@pando.danbenson.me` (the
  verified subdomain), not `@danbenson.me` (root domain, unverified — sends would fail/lose
  authentication). Dan needs to fix this himself in Settings.
- **Settings → Reply-To is empty.** Recommend setting it to a real inbox Dan checks (e.g. his
  Gmail), since the From address doesn't need to be a real mailbox but replies need somewhere to
  go.
- **WordPress signup widget** (`public/widget.js` + `/api/embed/subscribe`) is built and CORS-
  restricted to danbenson.me, but not yet embedded on the actual WordPress site.
- **Newsletter archive** — explicitly scoped as a fast-follow in the original plan. Not started.
  Intended to be WordPress-native (server-rendered PHP, not a Pando page) for SEO reasons — see
  plan history for the reasoning if you pick this up.
- **Campaign templates** — Dan asked for the ability to create a reusable template and apply it
  across multiple campaigns. Not yet designed or built.
- Physical mailing address in Settings has been filled in by Dan already ("Taipei, Taiwan") —
  don't overwrite it.

## Useful entry points

- `lib/sendCampaign.ts` — the actual send loop (batching, concurrency, idempotency)
- `lib/email.ts` — renders the real email HTML (light/dark theme support via `theme` param)
- `lib/markdown/email.ts` vs `lib/markdown/parse.ts` — two render paths, one for email (table
  layout, inlined styles) and one for the browser admin preview (CSS grid, classes)
- `/admin/campaigns/[id]` — the compose UI; has a "Preview email" button that shows the *actual*
  send-time HTML (not the approximate live-typing preview) with a light/dark toggle
- `app/api/cron/send-batches/route.ts` — protected by `CRON_SECRET`, called daily by Vercel Cron
