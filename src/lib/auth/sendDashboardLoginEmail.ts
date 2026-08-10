// ========================================
// File: src/lib/auth/sendDashboardLoginEmail.ts
// ========================================

import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import { prisma } from "@/lib/prisma";

const LOGIN_CTA_LABEL = "Sign in to SIXFL";
const LOGIN_LINK_TTL_HOURS = 24;
const CANONICAL_SITE_URL = "https://sixfl.co.uk";

function getSiteUrl() {
  const configured = (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    CANONICAL_SITE_URL
  ).replace(/\/+$/, "");

  // The live SIXFL site uses the apex domain. A login callback that starts on
  // www.sixfl.co.uk and then redirects to sixfl.co.uk can lose NextAuth's
  // host-scoped session cookie, which looks to the user like they sign in and
  // are immediately signed out again. Keep generated dashboard magic links on
  // one canonical host even if an older environment value still contains www.
  if (/^https:\/\/www\.sixfl\.co\.uk$/i.test(configured)) {
    return CANONICAL_SITE_URL;
  }

  return configured;
}

function getEmailFrom() {
  const from = process.env.EMAIL_FROM?.trim();

  if (!from) {
    throw new Error("Email sending is not configured.");
  }

  return from;
}

function getAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("Login links are not configured.");
  }

  return secret;
}

function hashVerificationToken(token: string) {
  return createHash("sha256")
    .update(`${token}${getAuthSecret()}`)
    .digest("hex");
}

function buildMagicLink(input: { email: string; token: string; callbackUrl: string }) {
  const params = new URLSearchParams({
    callbackUrl: input.callbackUrl,
    token: input.token,
    email: input.email,
  });

  return `${getSiteUrl()}/api/auth/callback/email?${params.toString()}`;
}

function getFirstName(displayName: string | null | undefined, email: string) {
  const fromName = displayName?.trim().split(/\s+/).filter(Boolean)[0];
  const fromEmail = email.split("@")[0]?.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];

  return fromName || fromEmail || "there";
}

export async function createDashboardLoginLink(input: {
  email: string;
  callbackPath: string;
}) {
  const email = input.email.trim().toLowerCase();
  const callbackPath = input.callbackPath.trim().startsWith("/")
    ? input.callbackPath.trim()
    : "/dashboard";
  const callbackUrl = `${getSiteUrl()}${callbackPath}`;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + LOGIN_LINK_TTL_HOURS * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashVerificationToken(token),
      expires,
    },
  });

  return {
    url: buildMagicLink({ email, token, callbackUrl }),
    expires,
  };
}

export async function sendDashboardLoginEmail(input: {
  email: string;
  displayName?: string | null;
  teamName?: string | null;
  callbackPath: string;
}) {
  const email = input.email.trim().toLowerCase();

  if (!email) {
    throw new Error("Player email address is missing.");
  }

  const loginLink = await createDashboardLoginLink({
    email,
    callbackPath: input.callbackPath,
  });
  const firstName = getFirstName(input.displayName, email);
  const teamLine = input.teamName?.trim()
    ? `This will take you to your SIXFL dashboard for ${input.teamName.trim()}.`
    : "This will take you to your SIXFL dashboard.";
  const body = [
    `Hi ${firstName},`,
    "",
    "Use the secure button below to sign in to SIXFL.",
    "",
    "{{cta}}",
    "",
    teamLine,
    "",
    `This link expires in ${LOGIN_LINK_TTL_HOURS} hours and can only be used with ${email}.`,
    "",
    "If you did not request this email, you can ignore it.",
  ].join("\n");
  const textBody = [
    `Hi ${firstName},`,
    "",
    "Use the secure sign-in link below to access SIXFL.",
    "",
    loginLink.url,
    "",
    teamLine,
    "",
    `This link expires in ${LOGIN_LINK_TTL_HOURS} hours and can only be used with ${email}.`,
    "",
    "If you did not request this email, you can ignore it.",
  ].join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: "Your SIXFL dashboard sign-in link",
    text: appendSIXFLTextSignature(textBody),
    html: buildSIXFLEmailHtml({
      body,
      cta: {
        label: LOGIN_CTA_LABEL,
        url: loginLink.url,
      },
      branding: input.teamName
        ? {
            teamName: input.teamName,
          }
        : undefined,
    }),
  });

  return loginLink;
}
