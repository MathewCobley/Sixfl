import { randomBytes } from "node:crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { buildExtraKitPaymentEmailCopy } from "@/lib/kits/extra-kit-payment-email-copy";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INCLUDED_KIT_QUANTITY = 7;
const EXTRA_KIT_PRICE_PENCE = 2000;
const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";
const KIT_PACKAGE_CHANGEOVER_AT = new Date("2026-08-01T10:33:15.000Z");

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

async function getKitEligibility(teamId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ eligible: boolean; legacyOffer: boolean }>
  >`
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = ${teamId}
            AND lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" kit_team
          WHERE kit_team."id" = ${teamId}
            AND kit_team."wantsFreeKit" = TRUE
        )
      ) AS "eligible",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = ${teamId}
            AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" legacy_team
          WHERE legacy_team."id" = ${teamId}
            AND legacy_team."wantsFreeKit" = TRUE
            AND legacy_team."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
        )
      ) AS "legacyOffer"
  `;

  return {
    eligible: Boolean(rows[0]?.eligible),
    legacyOffer: Boolean(rows[0]?.legacyOffer),
  };
}

async function getTeamData(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

async function getExtraKitCharges(teamId: string) {
  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId,
      title: { startsWith: EXTRA_KIT_TITLE_PREFIX },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    include: {
      transactions: {
        select: { amountPence: true },
      },
    },
  });

  return charges.map((charge) => {
    const paidPence = charge.transactions.reduce(
      (sum, transaction) => sum + transaction.amountPence,
      0,
    );
    const outstandingPence = Math.max(charge.amountPence - paidPence, 0);

    return {
      id: charge.id,
      payerName: charge.title.slice(EXTRA_KIT_TITLE_PREFIX.length).trim(),
      description: charge.description,
      amountPence: charge.amountPence,
      paidPence,
      outstandingPence,
      status:
        charge.status === "VOID"
          ? "CANCELLED"
          : outstandingPence <= 0 || charge.status === "PAID"
            ? "PAID"
            : "OPEN",
      paymentUrl:
        charge.paymentToken && charge.status !== "VOID" && outstandingPence > 0
          ? `/pay/extra-kit/${charge.paymentToken}`
          : null,
      createdAt: charge.createdAt.toISOString(),
    };
  });
}

async function ensurePayerRecipient(input: {
  teamId: string;
  teamName: string;
  userId: string;
  name: string | null;
  email: string;
}) {
  const email = input.email.trim().toLowerCase();
  const sourceId = `extra-kit-payer:${input.teamId}:${input.userId}`;

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: NotificationRecipientSourceType.GENERAL,
        sourceId,
      },
    },
    update: {
      audience: NotificationAudience.USER,
      displayName: input.name,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      isSuppressed: false,
      suppressionReason: null,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        userId: input.userId,
        purpose: "extra_team_kit_payment",
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId,
      audience: NotificationAudience.USER,
      displayName: input.name,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        userId: input.userId,
        purpose: "extra_team_kit_payment",
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { emailEnabled: true },
    create: { recipientId: recipient.id, emailEnabled: true },
  });

  return recipient;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, eligibility, requests] = await Promise.all([
    getTeamData(teamid),
    getKitEligibility(teamid),
    getExtraKitCharges(teamid),
  ]);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({
    eligible: eligibility.eligible,
    legacyOffer: eligibility.legacyOffer,
    includedKitQuantity: INCLUDED_KIT_QUANTITY,
    extraKitPricePence: EXTRA_KIT_PRICE_PENCE,
    team: {
      id: team.id,
      name: team.name,
    },
    members: team.members.map((member) => ({
      id: member.id,
      name: member.user.name || member.user.email || "Unnamed team member",
      email: member.user.email,
      role: member.role,
    })),
    requests,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const payload = (await request.json().catch(() => null)) as
    | { quantity?: unknown; memberIds?: unknown }
    | null;

  const quantity = Number(payload?.quantity);
  const memberIds = Array.isArray(payload?.memberIds)
    ? Array.from(
        new Set(
          payload.memberIds
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      )
    : [];

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return NextResponse.json(
      { error: "Choose between 1 and 10 additional kits." },
      { status: 400 },
    );
  }

  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one team member to receive a payment link." },
      { status: 400 },
    );
  }

  const [team, eligibility] = await Promise.all([
    getTeamData(teamid),
    getKitEligibility(teamid),
  ]);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: "This team is not eligible for the kit offer." },
      { status: 403 },
    );
  }

  const selectedMembers = team.members.filter((member) =>
    memberIds.includes(member.id),
  );

  if (selectedMembers.length !== memberIds.length) {
    return NextResponse.json(
      { error: "One or more selected team members could not be found." },
      { status: 400 },
    );
  }

  if (selectedMembers.some((member) => !member.user.email?.trim())) {
    return NextResponse.json(
      { error: "Every selected team member needs an email address." },
      { status: 400 },
    );
  }

  const existingOpenCount = await prisma.paymentCharge.count({
    where: {
      teamId: teamid,
      title: { startsWith: EXTRA_KIT_TITLE_PREFIX },
      status: { in: ["OPEN", "PART_PAID"] },
    },
  });

  if (existingOpenCount > 0) {
    return NextResponse.json(
      {
        error:
          "There are already open additional-kit payment requests. Complete or cancel those before creating another set.",
      },
      { status: 409 },
    );
  }

  const totalPence = quantity * EXTRA_KIT_PRICE_PENCE;
  const baseSharePence = Math.floor(totalPence / selectedMembers.length);
  const remainderPence = totalPence % selectedMembers.length;
  const batchReference = randomBytes(8).toString("hex");

  const charges = await prisma.$transaction(
    selectedMembers.map((member, index) => {
      const payerName = member.user.name || member.user.email || "Team member";
      const amountPence = baseSharePence + (index < remainderPence ? 1 : 0);

      return prisma.paymentCharge.create({
        data: {
          teamId: team.id,
          leagueId: team.leagueId,
          title: `${EXTRA_KIT_TITLE_PREFIX} ${payerName}`,
          description: `${quantity} additional complete kit${quantity === 1 ? "" : "s"} for ${team.name} at £20 each. Payment batch ${batchReference}.`,
          amountPence,
          dueDate: new Date(),
          paymentToken: randomBytes(24).toString("hex"),
        },
        select: {
          id: true,
          paymentToken: true,
          amountPence: true,
        },
      });
    }),
  );

  let emailsQueued = 0;
  let emailsFailed = 0;

  for (let index = 0; index < selectedMembers.length; index += 1) {
    const member = selectedMembers[index];
    const charge = charges[index];
    const email = member?.user.email?.trim();

    if (!member || !charge?.paymentToken || !email) {
      emailsFailed += 1;
      continue;
    }

    try {
      const recipient = await ensurePayerRecipient({
        teamId: team.id,
        teamName: team.name,
        userId: member.user.id,
        name: member.user.name,
        email,
      });
      const paymentUrl = new URL(
        `/pay/extra-kit/${charge.paymentToken}`,
        `${getPublicSiteUrl()}/`,
      ).toString();
      const payerName = member.user.name || email;
      const paymentCopy = buildExtraKitPaymentEmailCopy({
        teamName: team.name,
        payerName,
        quantity,
        amountPence: charge.amountPence,
        payerCount: selectedMembers.length,
        purchaseOnly: !eligibility.eligible,
      });

      // These defaults are retained temporarily because the existing standard-kit
      // prebuild migration still recognises them. The player-facing copy above is
      // the source of truth for every email that is actually queued.
      const notificationDefaults = {
        subject: `${team.name} additional kit contribution`,
        body: `Hi ${payerName},\n\nYour captain has asked you to contribute ${formatMoney(charge.amountPence)} towards ${quantity} additional SIXFL team kit${quantity === 1 ? "" : "s"}. The extra kits cost £20 each and the total has been divided between the selected team members.\n\nUse the secure payment link below.`,
        emailCta: {
          label: "Pay kit contribution",
          url: paymentUrl,
        },
      };

      await queueDirectNotification({
        ...notificationDefaults,
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.USER,
        subject: paymentCopy.subject,
        body: paymentCopy.body,
        isTransactional: true,
        sourceType: "EXTRA_TEAM_KIT_PAYMENT",
        sourceId: charge.id,
        metadata: {
          teamId: team.id,
          quantity,
          batchReference,
          paymentChargeId: charge.id,
        },
        emailCta: {
          label: paymentCopy.ctaLabel,
          url: paymentUrl,
        },
        createdByUserId: access.user?.id ?? null,
      });

      emailsQueued += 1;
    } catch (error) {
      console.error("Extra kit payment email could not be queued", error);
      emailsFailed += 1;
    }
  }

  return NextResponse.json(
    {
      success: true,
      totalPence,
      payerCount: selectedMembers.length,
      emailsQueued,
      emailsFailed,
      requests: await getExtraKitCharges(teamid),
    },
    { status: 201 },
  );
}
