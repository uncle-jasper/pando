import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

interface SendEmailArgs {
  to: string;
  from: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

export async function sendEmail({ to, from, replyTo, subject, html, headers }: SendEmailArgs) {
  const { data, error } = await getClient().emails.send({
    to,
    from,
    replyTo: replyTo || undefined,
    subject,
    html,
    headers,
  });
  if (error) throw new Error(error.message);
  return data;
}
