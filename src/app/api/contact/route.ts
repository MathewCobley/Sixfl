// ========================================
// File: src/app/api/contact/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const contactToEmail = process.env.CONTACT_TO_EMAIL;
const contactFromEmail = process.env.CONTACT_FROM_EMAIL;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type ContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  enquiryType?: string;
  message?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    if (!resend) {
      return NextResponse.json(
        { error: "Email service is not configured." },
        { status: 500 }
      );
    }

    if (!contactToEmail || !contactFromEmail) {
      return NextResponse.json(
        { error: "Contact email settings are missing." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ContactPayload;

    const name = body.name?.trim() || "";
    const email = body.email?.trim() || "";
    const phone = body.phone?.trim() || "";
    const enquiryType = body.enquiryType?.trim() || "General enquiry";
    const message = body.message?.trim() || "";

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Please complete name, email and message." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (name.length > 120 || email.length > 200 || phone.length > 50 || enquiryType.length > 100) {
      return NextResponse.json(
        { error: "One or more fields are too long." },
        { status: 400 }
      );
    }

    if (message.length < 10) {
      return NextResponse.json(
        { error: "Please enter a little more detail in your message." },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: "Your message is too long." },
        { status: 400 }
      );
    }

    const subject = `SIXFL Contact Form: ${enquiryType}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin-bottom: 16px;">New SIXFL contact form message</h2>

        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
        <p><strong>Enquiry type:</strong> ${escapeHtml(enquiryType)}</p>

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;" />

        <p><strong>Message:</strong></p>
        <p style="white-space: pre-line;">${escapeHtml(message)}</p>
      </div>
    `;

    const text = `
New SIXFL contact form message

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}
Enquiry type: ${enquiryType}

Message:
${message}
    `.trim();

    await resend.emails.send({
      from: contactFromEmail,
      to: contactToEmail,
      replyTo: email,
      subject,
      html,
      text,
    });

    return NextResponse.json({
      message: "Thanks — your message has been sent. We’ll be in touch soon.",
    });
  } catch (error) {
    console.error("Contact form error:", error);

    return NextResponse.json(
      { error: "Unable to send message right now. Please try again shortly." },
      { status: 500 }
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}