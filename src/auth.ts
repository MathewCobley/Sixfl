// ========================================
// File: src/auth.ts
// ========================================

import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import { renderNotificationText } from "@/lib/notifications/renderer";
import {
  getCaptainLoginContext,
  getPendingCaptainContext,
} from "@/lib/auth/pendingCaptain";

function getSiteUrl() {
  return (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function buildClaimUrl(claimCode?: string | null) {
  const baseUrl = getSiteUrl();

  return claimCode
    ? `${baseUrl}/claim?code=${encodeURIComponent(claimCode)}`
    : `${baseUrl}/claim`;
}

function stripCtaPlaceholder(value: string) {
  return value.replace(/\{\{\s*cta\s*\}\}/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function getPendingSquadActivationContext(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) return null;

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      email: normalizedEmail,
      status: "ACTIVE_SQUAD",
    },
    select: {
      id: true,
      firstName: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!prospect) return null;

  return {
    prospectId: prospect.id,
    firstName: prospect.firstName,
    teamId: prospect.team.id,
    teamName: prospect.team.name,
  };
}

async function buildLoginMagicLinkEmail(input: {
  email: string;
  url: string;
  pendingCaptain: Awaited<ReturnType<typeof getPendingCaptainContext>>;
}) {
  const template = await prisma.notificationTemplate.findUnique({
    where: { key: "login-magic-link-email" },
    select: {
      isActive: true,
      subject: true,
      body: true,
    },
  });

  const claimUrl = buildClaimUrl(input.pendingCaptain?.claimCode);
  const variables = {
    email: input.email,
    signInUrl: input.url,
    teamName: input.pendingCaptain?.teamName ?? "SIXFL",
    claimUrl,
    pendingCaptainNotice: input.pendingCaptain
      ? `It looks like your captain access still needs to be claimed for ${input.pendingCaptain.teamName}. Sign in first, then complete your team claim.`
      : "",
  };

  if (template?.isActive && template.subject?.trim() && template.body?.trim()) {
    const renderedSubject = renderNotificationText(template.subject, variables);
    const renderedBody = renderNotificationText(template.body, variables);

    return {
      subject: renderedSubject,
      text: appendSIXFLTextSignature(stripCtaPlaceholder(renderedBody)),
      html: buildSIXFLEmailHtml({
        body: renderedBody,
      }),
    };
  }

  const fallbackBody = input.pendingCaptain
    ? `Hi\n\nUse the secure sign-in link below to access SIXFL.\n\n${input.url}\n\nIt looks like your captain access still needs to be claimed for ${input.pendingCaptain.teamName}. Once you are signed in, complete your team claim here:\n\n${claimUrl}`
    : `Hi\n\nUse the secure sign-in link below to access SIXFL.\n\n${input.url}\n\nIf you did not request this email, you can ignore it.`;

  return {
    subject: "Your SIXFL sign-in link",
    text: appendSIXFLTextSignature(fallbackBody),
    html: buildSIXFLEmailHtml({
      body: `${fallbackBody}\n\nIf you did not request this email, you can ignore it.`,
    }),
  };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      async sendVerificationRequest({ identifier, url, provider }) {
        const email = identifier.toLowerCase().trim();

        const [
          existingUser,
          pendingCaptain,
          captainLoginContext,
          pendingSquadActivation,
        ] = await Promise.all([
          prisma.user.findUnique({
            where: { email },
          }),
          getPendingCaptainContext(email),
          getCaptainLoginContext(email),
          getPendingSquadActivationContext(email),
        ]);

        if (!existingUser && !pendingCaptain && !captainLoginContext && !pendingSquadActivation) {
          return;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = provider.from ?? process.env.EMAIL_FROM!;
        const to = email;
        const emailContent = await buildLoginMagicLinkEmail({
          email,
          url,
          pendingCaptain,
        });

        await resend.emails.send({
          from,
          to,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });
      },
      from: process.env.EMAIL_FROM!,
    }),
  ],

  session: { strategy: "database" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NEXTAUTH_DEBUG === "true",

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "email") {
        const email = user.email?.toLowerCase().trim();

        if (!email) {
          return false;
        }

        const [
          existingUser,
          pendingCaptain,
          captainLoginContext,
          pendingSquadActivation,
        ] = await Promise.all([
          prisma.user.findUnique({
            where: { email },
          }),
          getPendingCaptainContext(email),
          getCaptainLoginContext(email),
          getPendingSquadActivationContext(email),
        ]);

        if (!existingUser && !pendingCaptain && !captainLoginContext && !pendingSquadActivation) {
          return false;
        }
      }

      return true;
    },

    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id = user.id;
      }

      return session;
    },
  },
};
