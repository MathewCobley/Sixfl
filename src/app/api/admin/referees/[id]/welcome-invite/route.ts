// ========================================
// File: src/app/api/admin/referees/[id]/welcome-invite/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  UserRole,
} from "@prisma/client";

import { linkQueuedEmailDispatchToThread } from "@/lib/messaging/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

const REFEREE_WELCOME_TEMPLATE_KEY = "referee-welcome-login-email";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getFirstName(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "there";
  return source.trim().split(/\s+/)[0] || "there";
}

function buildRefereeLoginUrl(email: string) {
  const url = new URL("/login", `${getPublicSiteUrl()}/`);
  url.searchParams.set("email", email);
  url.searchParams.set("callbackUrl", "/referee");
  return url.toString();
}

async function ensureRefereeWelcomeEmailTemplate() {
  return prisma.notificationTemplate.upsert({
    where: { key: REFEREE_WELCOME_TEMPLATE_KEY },
    update: {
      name: "Referee welcome login email",
      description: "Welcome email for a referee with the normal SIXFL magic-link login route to their referee dashboard.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.REFEREE,
      subject: "Welcome to SIXFL refereeing",
      body: [
        "Hi {{firstName}},",
        "",
        "You’ve been added as a SIXFL referee.",
        "",
        "Use the button below to sign in with your email address. The login page will send you a secure magic link and take you to your referee dashboard.",
        "",
        "From there you can view your referee nights, availability, match sheets and cashup information.",
        "",
        "{{cta}}",
      ].join("\n"),
      ctaLabel: "Open referee login",
      ctaUrlKey: "refereeLoginUrl",
      isActive: true,
    },
    create: {
      key: REFEREE_WELCOME_TEMPLATE_KEY,
      name: "Referee welcome login email",
      description: "Welcome email for a referee with the normal SIXFL magic-link login route to their referee dashboard.",
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.REFEREE,
      subject: "Welcome to SIXFL refereeing",
      body: [
        "Hi {{firstName}},",
        "",
        "You’ve been added as a SIXFL referee.",
        "",
        "Use the button below to sign in with your email address. The login page will send you a secure magic link and take you to your referee dashboard.",
        "",
        "From there you can view your referee nights, availability, match sheets and cashup information.",
        "",
        "{{cta}}",
      ].join("\n"),
      ctaLabel: "Open referee login",
      ctaUrlKey: "refereeLoginUrl",
      isActive: true,
    },
  });
}

async function getRefereePhone(refereeId: string, createdFromLeadId: string | null) {
  const [profileRows, sourceLead] = await Promise.all([
    prisma.$queryRaw<Array<{ phone: string | null }>>`
      SELECT "phone"
      FROM "RefereeProfile"
      WHERE "userId" = ${refereeId}
      LIMIT 1
    `.catch(() => []),
    createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: createdFromLeadId },
          select: { phone: true },
        })
      : null,
  ]);

  return profileRows[0]?.phone || sourceLead?.phone || null;
}

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: RouteContext) {
  const { user: adminUser } = await requireAdmin();
  const { id } = await params;

  const referee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    return NextResponse.json({ error: "Referee not found." }, { status: 404 });
  }

  const email = referee.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "This referee needs an email address first." }, { status: 400 });
  }

  await ensureRefereeWelcomeEmailTemplate();

  const phone = await getRefereePhone(referee.id, referee.createdFromLeadId);
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: referee.id,
    audience: NotificationAudience.REFEREE,
    displayName: referee.name,
    email,
    phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      refereeUserId: referee.id,
      sourceLeadId: referee.createdFromLeadId ?? null,
      welcomeLoginEmail: true,
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: REFEREE_WELCOME_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName: getFirstName(referee.name, email),
      fullName: referee.name || email,
      refereeEmail: email,
      refereeLoginUrl: buildRefereeLoginUrl(email),
    },
    sourceType: "REFEREE_INVITE",
    sourceId: referee.id,
    metadata: {
      origin: "central_referee_welcome_invite",
      refereeUserId: referee.id,
      loginDestination: "/referee",
      centralComms: true,
    },
    createdByUserId: adminUser?.id ?? null,
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    return NextResponse.json({ error: "The welcome email could not be queued." }, { status: 500 });
  }

  await linkQueuedEmailDispatchToThread({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    sourceType: "REFEREE",
    sourceId: referee.id,
    contactName: referee.name,
    toEmail: email,
    subject: dispatch.subject ?? "Welcome to SIXFL refereeing",
    bodyText: dispatch.bodyText,
    bodyHtml: dispatch.bodyHtml,
    createdByUserId: adminUser?.id ?? null,
  });

  return NextResponse.json({ ok: true, dispatchId: dispatch.id });
}
