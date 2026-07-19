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
- **Client-side image resize keeps PNG only when the image actually has real transparency**
  (`hasRealTransparency()` in `lib/client-image-resize.ts` does a pixel-alpha scan). Early version
  kept PNG format for any `.png` file regardless of content, which compressed poorly for photo-like
  PNGs. GIFs are passed through untouched to preserve animation.
- **A `drizzle-kit push` scare turned out to be nothing.** Mid-session, `/admin/campaigns` briefly
  showed empty and a DB check showed campaigns/subscribers/images all at 0 rows. Looked like schema
  push data loss. Turned out Dan had manually deleted the campaign and photos himself moments
  earlier while testing ("cleaning things up") — unrelated to the schema changes. No data was
  actually lost and no recovery was needed. Documented in case it looks alarming again: check with
  Dan before assuming a `drizzle-kit push` (even a purely additive one) wiped data — it's more
  likely explained by direct user action, since he was actively testing in the same window.

## User's standing preference: stay free as long as possible

Explicit instruction: optimize every decision toward staying on free tiers (Vercel Hobby, Neon
free, Resend free, Vercel Blob free) for as long as sustainable. Only reach for a paid tier when
genuinely necessary, and flag it clearly when that point arrives rather than assuming it's fine.

## Features built since initial launch

- **Campaign templates.** Dedicated editor at `/admin/templates` (separate from campaigns, per
  Dan's explicit choice — not a "flag a campaign as a template" approach). `templates` table
  in `lib/schema.ts` (name, markdownBody, heroImageUrl, heroImageAlt). The campaigns list page's
  "New draft" button is now a dropdown: "Blank draft" or "From template: [name]" — the latter
  posts `{ templateId }` to `POST /api/admin/campaigns`, which clones the template's body/hero
  image into a new campaign row. Editing a template never affects campaigns already created from
  it (one-time copy, not a live link).
- **Email preview modal.** "Preview email" button on the campaign editor opens a modal
  (`components/EmailPreviewModal.tsx`) with an iframe rendering the *actual* send-time HTML via
  `GET /api/admin/campaigns/[id]/preview?theme=light|dark` (works for any campaign status, unlike
  the public `/p/[id]` route which requires `sent`). Light/dark toggle buttons let Dan check both
  themes without needing to actually switch his OS/browser theme. Opening the modal first flushes
  any pending debounced autosave so the preview always reflects the latest edits.
- **Images admin page** (`/admin/images`) — grid of every uploaded image with size/date, Copy URL
  and Delete buttons, and a live storage-usage bar against the 1GB Vercel Blob free tier. Delete
  calls Blob's `del()` to actually remove the file, not just the DB row.
- **Delete drafts** — campaigns list page has a delete action with a confirm dialog. Deleting a
  draft also deletes its hero image and any inline `![]()` images from Blob + the `images` table,
  but only the ones not still referenced by another campaign or template (`lib/imageCleanup.ts`
  scans all campaigns/templates for the same URL before deleting — safe against shared/reused
  images). Manual deletes from `/admin/images` always delete regardless of references.
- **Footer** — every Pando page (`admin/(protected)/layout.tsx`, `admin/login`, `/subscribe`)
  now renders `components/Footer.tsx`: a minimal "2026 · Dan Benson" line.
- **Aspen icon** — `public/aspen.png` used as the favicon (`app/icon.png`) and shown next to the
  "Pando" wordmark on the login screen and admin nav bar.

## Known outstanding work (not yet done)

- **Settings → From email is currently wrong.** It needs to be `@pando.danbenson.me` (the
  verified subdomain), not `@danbenson.me` (root domain, unverified — sends would fail/lose
  authentication). Dan needs to fix this himself in Settings.
- **Settings → Reply-To is empty.** Recommend setting it to a real inbox Dan checks (e.g. his
  Gmail), since the From address doesn't need to be a real mailbox but replies need somewhere to
  go.
- **WordPress signup widget** (`public/widget.js` + `/api/embed/subscribe`) is built and CORS-
  restricted to danbenson.me, but not yet embedded on the actual WordPress site.
- Physical mailing address in Settings has been filled in by Dan already ("Taipei, Taiwan") —
  don't overwrite it.

## Next up: newsletter page on danbenson.me

The next planned piece of work (not started) is the **newsletter section on danbenson.me itself**
(WordPress), per the original plan's phased rollout:

1. Start simple: a `danbenson.me/newsletter` page with "coming soon" copy and just the signup
   widget (`public/widget.js` embedded via a WordPress Custom HTML block — no theme/plugin changes
   needed, see "WordPress signup widget" above).
2. Once the first real issue has been sent, that same page grows an **archive** of past issues
   below the signup form. Per the original plan, build this as a server-rendered WordPress
   template/plugin (PHP) that queries a new public, read-only Pando API (`status = 'sent'`
   campaigns only, never drafts) — not a client-side JS widget — so archived issues are real
   server-rendered HTML for SEO/link-preview purposes, inheriting the site's theme CSS natively.
   Pando's own `/p/[campaignId]` view-in-browser page stays the link used *inside* sent emails,
   but the WordPress archive page becomes the canonical indexed copy.

## Markdown syntax additions beyond tree

Pando's editor is standard markdown plus a few extensions not in tree's parser, implemented in
parallel in `lib/markdown/parse.ts` (browser preview) and `lib/markdown/email.ts` (email render):

- **`:::gallery` ... `:::`** — a fenced block of `![caption](url)` lines, rendered as a real CSS
  grid in the browser preview and an HTML table grid in email (email clients don't support
  grid/flexbox reliably). This is also the only way to get a *visible* image caption today —
  a plain inline `![caption](url)` outside a gallery block only sets the `alt` attribute, which
  isn't shown on-page.
- **`-# text`** — a small, muted metadata line (e.g. `-# Issue #12 — July 18, 2026` at the top of
  an issue). Renders as `.meta-text` / `.email-meta`, distinct from `>` blockquotes (which have a
  left border and italics — a pull-quote look, not a subtle caption).
- **A line ending in `\`** forces a `<br>` line break within a paragraph, without starting a new
  paragraph (which would add a blank-line gap). A single newline with no backslash still just
  soft-wraps into a space, same as standard markdown. Implemented via `joinParagraphLines()` +
  a `HARD_BREAK_TOKEN` placeholder string (plain ASCII, deliberately not a control character —
  an earlier draft used a literal `\0` byte, which is invisible in editors/grep and dangerous to
  match against, so don't reintroduce that).

## Useful entry points

- `lib/sendCampaign.ts` — the actual send loop (batching, concurrency, idempotency)
- `lib/email.ts` — renders the real email HTML (light/dark theme support via `theme` param)
- `lib/markdown/email.ts` vs `lib/markdown/parse.ts` — two render paths, one for email (table
  layout, inlined styles) and one for the browser admin preview (CSS grid, classes)
- `/admin/campaigns/[id]` — the compose UI; has a "Preview email" button that shows the *actual*
  send-time HTML (not the approximate live-typing preview) with a light/dark toggle
- `app/api/cron/send-batches/route.ts` — protected by `CRON_SECRET`, called daily by Vercel Cron
- `lib/client-image-resize.ts` — client-side canvas resize/compress before every upload, to stay
  under Vercel's ~4.5MB serverless body limit and keep Blob usage sustainable
- `/admin/images` — image library management, storage usage bar
- `/admin/templates` — reusable campaign templates, separate editor from campaigns
