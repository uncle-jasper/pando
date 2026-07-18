// Transactional emails (double opt-in confirmation) are a distinct template from
// campaign issues — simpler, no markdown body, no hero image, just a confirm button.
function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

export function confirmationEmailHtml(confirmUrl: string, fromName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirm your subscription</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2c2416;">
<div style="width:100%;background:#f5f0e8;padding:24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width:480px;margin:0 auto;background:#ffffff;">
<tbody><tr><td style="padding:32px;text-align:center;">
<h1 style="font-size:22px;margin:0 0 16px;">Confirm your subscription</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
Please confirm you'd like to receive ${fromName}'s newsletter.
</p>
<a href="${confirmUrl}" style="display:inline-block;background:#8b6e4e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;">Confirm subscription</a>
<p style="font-size:12px;color:#999;margin-top:28px;">
If you didn't request this, you can safely ignore this email.
</p>
</td></tr></tbody>
</table>
</div>
</body>
</html>`;
}

export function confirmUrlFor(token: string): string {
  return `${appUrl()}/confirm/${token}`;
}
