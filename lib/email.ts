import juice from "juice";
import { renderEmailBody } from "./markdown/email";
import { makeSubscriberToken } from "./tokens";

interface CampaignLike {
  id: string;
  subject: string;
  preheader: string | null;
  markdownBody: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
}

interface SettingsLike {
  fromName: string;
  physicalMailingAddress: string;
  fontFamily: string;
  lightBg: string;
  lightText: string;
  lightMuted: string;
  darkBg: string;
  darkText: string;
  darkMuted: string;
}

interface SubscriberLike {
  id: string;
}

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

// Branding (fonts/colors) comes from Settings, sampled from the real site, so
// campaign emails match it in both light and dark mode. Dark-mode support relies on
// juice's default preserveMediaQueries behavior: base colors get inlined as
// style="..." for broad client support, while this @media block survives inlining
// in a retained <style> tag for clients that honor prefers-color-scheme (Apple Mail,
// Outlook.com, etc) — !important is required there since it must beat the inlined style.
function emailCss(settings: SettingsLike): string {
  return `
  body { margin:0; padding:0; background:${settings.lightBg}; font-family:${settings.fontFamily}; color:${settings.lightText}; }
  .email-wrapper { width:100%; background:${settings.lightBg}; padding: 24px 0; }
  .email-container { max-width:600px; margin:0 auto; background:${settings.lightBg}; }
  .hero-img { width:100%; height:auto; display:block; border:0; }
  .email-content { padding: 24px 32px; }
  .email-h1 { font-size:28px; font-weight:700; margin:0 0 12px; line-height:1.3; }
  .email-h2 { font-size:22px; font-weight:700; margin:20px 0 10px; }
  .email-h3, .email-h4, .email-h5, .email-h6 { font-size:18px; font-weight:700; margin:16px 0 8px; }
  .email-p { font-size:16px; line-height:1.6; margin:0 0 14px; }
  .email-list { font-size:16px; line-height:1.6; margin:0 0 14px; padding-left:24px; }
  .email-blockquote { border-left:3px solid ${settings.lightMuted}; padding:4px 0 4px 16px; color:${settings.lightMuted}; font-style:italic; margin:0 0 14px; }
  .email-pre { background:${settings.lightMuted}22; padding:12px 16px; border-radius:6px; overflow-x:auto; margin:0 0 14px; font-family: 'Courier New', monospace; font-size:14px; }
  .email-hr { border:none; border-top:1px solid ${settings.lightMuted}55; margin:20px 0; }
  .email-link { color:${settings.lightText}; text-decoration:underline; }
  .email-img { max-width:100%; display:block; border:0; margin: 10px 0; }
  .gallery-table { margin: 10px 0; }
  .gallery-cell { padding:4px; vertical-align:top; }
  .gallery-img { width:100%; height:auto; display:block; border:0; border-radius:4px; }
  .gallery-caption { font-size:12px; color:${settings.lightMuted}; margin-top:4px; }
  .email-footnotes { border-top:1px solid ${settings.lightMuted}55; margin-top:20px; padding-top:12px; }
  .email-footnote { font-size:13px; color:${settings.lightMuted}; margin:0 0 6px; }
  .preheader { display:none !important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden; mso-hide:all; }
  .email-footer { padding: 20px 32px; font-size:12px; color:${settings.lightMuted}; text-align:center; }
  .email-footer a { color:${settings.lightMuted}; }

  @media (prefers-color-scheme: dark) {
    body, .email-wrapper, .email-container { background:${settings.darkBg} !important; }
    body, .email-content, .email-h1, .email-h2, .email-h3, .email-h4, .email-h5, .email-h6, .email-p, .email-list, .email-link {
      color:${settings.darkText} !important;
    }
    .email-blockquote { color:${settings.darkMuted} !important; border-left-color:${settings.darkMuted} !important; }
    .email-footer, .email-footer a, .email-footnote, .gallery-caption { color:${settings.darkMuted} !important; }
    .email-pre { background:${settings.darkMuted}33 !important; }
  }
`;
}

export function renderEmailHtml(
  campaign: CampaignLike,
  subscriber: SubscriberLike | null,
  settings: SettingsLike
): string {
  const viewInBrowserUrl = `${appUrl()}/p/${campaign.id}`;

  const bodyHtml = renderEmailBody(campaign.markdownBody);

  const heroHtml =
    campaign.heroImageUrl && /^https:\/\//i.test(campaign.heroImageUrl)
      ? `<img src="${campaign.heroImageUrl}" alt="${campaign.heroImageAlt || ""}" class="hero-img">`
      : "";

  // subscriber is null for the public "view in browser" page, where there's no
  // subscriber-specific unsubscribe link to show (you're already reading it in a browser).
  const footerLinks = subscriber
    ? `<a href="${viewInBrowserUrl}">View in browser</a> &middot; <a href="${appUrl()}/unsubscribe/${makeSubscriberToken(
        subscriber.id
      )}">Unsubscribe</a>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${campaign.subject}</title>
<style>${emailCss(settings)}</style>
</head>
<body>
<div class="preheader">${campaign.preheader || ""}</div>
<div class="email-wrapper">
<table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" align="center">
<tbody>
<tr><td>
${heroHtml}
<div class="email-content">
${bodyHtml}
</div>
<div class="email-footer">
${settings.fromName} &middot; ${settings.physicalMailingAddress}${footerLinks ? `<br>${footerLinks}` : ""}
</div>
</td></tr>
</tbody>
</table>
</div>
</body>
</html>`;

  return juice(html, { preserveMediaQueries: true });
}

export function unsubscribeHeaders(subscriberId: string) {
  const token = makeSubscriberToken(subscriberId);
  const url = `${appUrl()}/unsubscribe/${token}`;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
