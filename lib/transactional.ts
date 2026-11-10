// Transactional emails (double opt-in confirmation, owner notification) are a distinct
// template from campaign issues — no markdown body, no hero image. They use the same
// Settings → Branding font/colors as issues (lib/email.ts), so they look like the newsletter:
// monochrome Inconsolata, lowercase masthead, 40px hairline. Light colors are inlined as the
// base; a prefers-color-scheme block (with !important, to beat the inline styles) switches to
// the dark palette in clients that honor it.
function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

export interface BrandingLike {
  fontFamily: string;
  lightBg: string;
  lightText: string;
  lightMuted: string;
  darkBg: string;
  darkText: string;
  darkMuted: string;
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string);
}

// The font stack contains double quotes ("SF Mono"), which would end a style="..." attribute
// early and drop the font. Swap them for single quotes before inlining.
function safeFont(b: BrandingLike): BrandingLike {
  return { ...b, fontFamily: b.fontFamily.replace(/"/g, "'") };
}

// Shared shell: masthead line, muted subline, hairline, then the inner HTML.
function shell(b: BrandingLike, title: string, masthead: string, subline: string, inner: string): string {
  b = safeFont(b);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    body, .tx-wrap, .tx-box { background:${b.darkBg} !important; }
    .tx-text { color:${b.darkText} !important; }
    .tx-muted, .tx-muted a { color:${b.darkMuted} !important; }
    .tx-rule { border-top-color:${b.darkMuted} !important; }
    .tx-btn { background:${b.darkText} !important; color:${b.darkBg} !important; }
  }
  @media only screen and (max-width: 480px) {
    .tx-pad { padding:32px 16px 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${b.lightBg};font-family:${b.fontFamily};color:${b.lightText};">
<div class="tx-wrap" style="width:100%;background:${b.lightBg};padding:12px 0;">
<table role="presentation" class="tx-box" width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;margin:0 auto;background:${b.lightBg};">
<tbody><tr><td class="tx-pad" style="padding:40px 32px 28px;font-family:${b.fontFamily};">
<p class="tx-text" style="font-size:15px;font-weight:700;line-height:1.5;margin:0 0 2px;color:${b.lightText};">${esc(masthead)}</p>
<p class="tx-muted" style="font-size:13px;line-height:1.5;margin:0;color:${b.lightMuted};">${esc(subline)}</p>
<div class="tx-rule" style="width:40px;height:0;border-top:1px solid ${b.lightMuted};margin:16px 0 24px;line-height:0;font-size:0;">&nbsp;</div>
${inner}
</td></tr></tbody>
</table>
</div>
</body>
</html>`;
}

export function confirmationEmailSubject(newsletterName: string | null): string {
  return newsletterName ? `${newsletterName.toLowerCase()} – confirm your subscription` : "Confirm your subscription";
}

export function confirmationEmailHtml(
  confirmUrl: string,
  newsletterName: string | null,
  branding: BrandingLike
): string {
  const b = safeFont(branding);
  const masthead = newsletterName ? newsletterName.toLowerCase() : "newsletter";
  const inner = `<p class="tx-text" style="font-size:15px;line-height:1.6;margin:0 0 24px;color:${b.lightText};">
Thanks for signing up. Tap below to confirm and you'll get each new issue in your inbox, about once a month.
</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="tx-btn" style="background:${b.lightText};">
<a href="${confirmUrl}" class="tx-btn" style="display:inline-block;background:${b.lightText};color:${b.lightBg};text-decoration:none;padding:11px 24px;font-size:15px;font-family:${b.fontFamily};">confirm subscription</a>
</td></tr></table>
<p class="tx-muted" style="font-size:12px;line-height:1.5;margin:32px 0 0;color:${b.lightMuted};">
If you didn't sign up, you can ignore this email.<br>— Dan · <a href="https://danbenson.me" style="color:${b.lightMuted};">danbenson.me</a>
</p>`;
  return shell(b, "Confirm your subscription", masthead, "confirm your subscription", inner);
}

export function confirmUrlFor(token: string): string {
  return `${appUrl()}/confirm/${token}`;
}

// Owner-facing "you have a new subscriber" notification — sent to settings.notifyEmail,
// not to the subscriber.
export function newSubscriberNotificationHtml(
  subscriberEmail: string,
  subscriberName: string | null,
  branding: BrandingLike
): string {
  const b = safeFont(branding);
  const who = subscriberName ? `${esc(subscriberName)} (${esc(subscriberEmail)})` : esc(subscriberEmail);
  const inner = `<p class="tx-text" style="font-size:15px;line-height:1.6;margin:0 0 24px;color:${b.lightText};">
${who} just confirmed their subscription.
</p>
<p class="tx-muted" style="font-size:12px;line-height:1.5;margin:0;color:${b.lightMuted};">
<a href="${appUrl()}/admin/dashboard" style="color:${b.lightMuted};">open the dashboard</a>
</p>`;
  return shell(b, "New subscriber", "pando", "new subscriber", inner);
}

// The page a subscriber lands on after tapping the confirm link (app/confirm/[token]/route.ts).
// Follows the reader's OS light/dark setting.
export function confirmPageHtml(message: string, newsletterName: string | null, b: BrandingLike): string {
  const masthead = newsletterName ? newsletterName.toLowerCase() : "newsletter";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(masthead)}</title>
<style>
  body { font-family:${b.fontFamily}; background:${b.lightBg}; color:${b.lightText}; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  main { max-width:420px; padding:32px; }
  .mh { font-size:15px; font-weight:700; margin:0 0 2px; }
  .rule { width:40px; border-top:1px solid ${b.lightMuted}; margin:16px 0 24px; }
  .msg { font-size:15px; line-height:1.6; margin:0 0 24px; }
  a { color:${b.lightMuted}; font-size:13px; }
  @media (prefers-color-scheme: dark) {
    body { background:${b.darkBg}; color:${b.darkText}; }
    .rule { border-top-color:${b.darkMuted}; }
    a { color:${b.darkMuted}; }
  }
</style>
</head>
<body><main>
<p class="mh">${esc(masthead)}</p>
<div class="rule"></div>
<p class="msg">${esc(message)}</p>
<a href="https://danbenson.me">danbenson.me</a>
</main></body>
</html>`;
}
