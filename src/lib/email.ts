// ========================================
// File: src/lib/email.ts
// ========================================

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const emailFrom =
  process.env.EMAIL_FROM?.trim() || "hello@sixfl.co.uk";

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY is missing. Email not sent.");
    return;
  }

  await resend.emails.send({
    from: emailFrom,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}