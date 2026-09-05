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
import {
  markLatestSignInLinkUsed,
  markSignInLinkFailed,
  markSignInLinkSent,
  startSignInLinkActivity,
} from "@/lib/auth/sign-in-link-activity";
import { setSignInRequestStage } from "@/lib/auth/sign-in-request-context";

const LOGIN_CTA_LABEL = "Sign in to SIXFL";
const CTA_PLACEHOLDER = "{{cta}}";

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

function replaceRawSignInUrlWithCta(input: { body: string; url: string }) {
  const body = input.body.trim();
  const url = input.url.trim();

  if (!body || !url) return body;
  if (body.includes(CTA_PLACEHOLDER)) return body;

  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const replaced = body.replace(new RegExp(escapedUrl, "g"), CTA_PLACEHOLDER);

  return replaced.includes(CTA_PLACEHOLDER)
    ? replaced.replace(/\n{3,}/g, "\n\n").trim()
    : `${body}\n\n${CTA_PLACEHOLDER}`;
}

async function recordSuccessfulLogin(input: { userId?: string | null; email?: string | null }) {
  const userId = input.userId?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;

  try {
    if (userId) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "lastLoginAt" = NOW()
        WHERE "id" = ${userId}
      `;
      return;
    }

    if (email) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "lastLoginAt" = NOW()
        WHERE LOWER("email") = ${email}
      `;
    }
  } catch (error) {
    console.warn("Could not record successful login timestamp", error);
  }
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

  if (!prospect?.team) return null;

  return {
    prospectId: prospect.id,
    firstName: prospect.firstName,
    teamId: prospect.team.id,
    teamName: prospect.team.name,
  };
}

function buildSignInLinkActivityContext(input: {
  existingUser: {
    id: string;
    name: string | null;
    role: string;
    teamMembers: Array<{
      role: string;
      team: { id: string; name: string };
    }>;
  } | null;
  pendingCaptain: Awaited<ReturnType<typeof getPendingCaptainContext>>;
  captainLoginContext: Awaited<ReturnType<typeof getCaptainLoginContext>>;
  pendingSquadActivation: Awaited<ReturnType<typeof getPendingSquadActivationContext>>;
}) {
  const membership = input.existingUser?.teamMembers[0] ?? null;
  const team = membership?.team
    ? membership.team
    : input.pendingCaptain
      ? { id: input.pendingCaptain.teamId, name: input.pendingCaptain.teamName }
      : input.captainLoginContext
        ? {
            id: input.captainLoginContext.teamId,
            name: input.captainLoginContext.teamName,
          }
        : input.pendingSquadActivation
          ? {
              id: input.pendingSquadActivation.teamId,
              name: input.pendingSquadActivation.teamName,
            }
          : null;

  const accountType =
    input.existingUser?.role === "ADMIN" || input.existingUser?.role === "REFEREE"
      ? input.existingUser.role
      : membership?.role
        ? membership.role
        : input.pendingCaptain || input.captainLoginContext
          ? "CAPTAIN"
          : input.pendingSquadActivation
            ? "INVITED_PLAYER"
            : "USER";

  return {
    userId: input.existingUser?.id ?? input.captainLoginContext?.captainUserId ?? null,
    userName: input.existingUser?.name ?? input.pendingSquadActivation?.firstName ?? null,
    accountType,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
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
  const loginCta = {
    label: LOGIN_CTA_LABEL,
    url: input.url,
  };

  if (template?.isActive && template.subject?.trim() && template.body?.trim()) {
    const renderedSubject = renderNotificationText(template.subject, variables);
    const renderedBody = renderNotificationText(template.body, variables);
    const htmlBody = replaceRawSignInUrlWithCta({
      body: renderedBody,
      url: input.url,
    });

    return {
      subject: renderedSubject,
      text: appendSIXFLTextSignature(stripCtaPlaceholder(renderedBody)),
      html: buildSIXFLEmailHtml({
        body: htmlBody,
        cta: loginCta,
      }),
    };
  }

  const fallbackTextBody = input.pendingCaptain
    ? `Hi\n\nUse the secure sign-in link below to access SIXFL.\n\n${input.url}\n\nIt looks like your captain access still needs to be claimed for ${input.pendingCaptain.teamName}. Once you are signed in, complete your team claim here:\n\n${claimUrl}`
    : `Hi\n\nUse the secure sign-in link below to access SIXFL.\n\n${input.url}\n\nIf you did not request this email, you can ignore it.`;
  const fallbackHtmlBody = input.pendingCaptain
    ? `Hi\n\nUse the secure sign-in button below to access SIXFL.\n\n${CTA_PLACEHOLDER}\n\nIt looks like your captain access still needs to be claimed for ${input.pendingCaptain.teamName}. Once you are signed in, complete your team claim here:\n\n${claimUrl}`
    : `Hi\n\nUse the secure sign-in button below to access SIXFL.\n\n${CTA_PLACEHOLDER}\n\nIf you did not request this email, you can ignore it.`;

  return {
    subject: "Your SIXFL sign-in link",
    text: appendSIXFLTextSignature(fallbackTextBody),
    html: buildSIXFLEmailHtml({
      body: fallbackHtmlBody,
      cta: loginCta,
    }),
  };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      async sendVerificationRequest({ identifier, url, provider }) {
        const email = identifier.toLowerCase().trim();
        setSignInRequestStage("email preparation");

        const [
          existingUser,
          pendingCaptain,
          captainLoginContext,
          pendingSquadActivation,
        ] = await Promise.all([
          prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              role: true,
              teamMembers: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: {
                  role: true,
                  team: { select: { id: true, name: true } },
                },
              },
            },
          }),
          getPendingCaptainContext(email),
          getCaptainLoginContext(email),
          getPendingSquadActivationContext(email),
        ]);

        if (!existingUser && !pendingCaptain && !captainLoginContext && !pendingSquadActivation) {
          throw new Error("Sign-in access is no longer available. Contact SIXFL.");
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = provider.from ?? process.env.EMAIL_FROM!;
        const to = email;
        const emailContent = await buildLoginMagicLinkEmail({
          email,
          url,
          pendingCaptain,
        });
        const activityContext = buildSignInLinkActivityContext({
          existingUser,
          pendingCaptain,
          captainLoginContext,
          pendingSquadActivation,
        });
        const activityId = await startSignInLinkActivity({
          email,
          magicLinkUrl: url,
          ...activityContext,
        });

        try {
          setSignInRequestStage("email delivery");
          const result = await resend.emails.send({
            from,
            to,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          });

          if (result.error) {
            throw new Error(result.error.message || "Resend rejected the sign-in email.");
          }

          await markSignInLinkSent({
            activityId,
            providerMessageId: result.data?.id ?? null,
          });
          setSignInRequestStage("verification token");
        } catch (error) {
          await markSignInLinkFailed({ activityId, error });
          throw error;
        }
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

  events: {
    async signIn({ user, account }) {
      // This event runs only AFTER a valid link is consumed and the adapter
      // has persisted the real user. Never verify in callbacks.signIn: that
      // also runs on the unauthenticated request, with a prototype user ID.
      if (account?.provider === "email" && user.id) {
        await prisma.user.updateMany({
          where: { id: user.id, emailVerified: null },
          data: { emailVerified: new Date() },
        });
      }
      await Promise.all([
        recordSuccessfulLogin({
          userId: user.id,
          email: user.email,
        }),
        markLatestSignInLinkUsed({
          userId: user.id,
          email: user.email,
        }),
      ]);
    },
  },

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "email") {
        setSignInRequestStage("account checks");
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
