// ========================================
// File: src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { ensurePlayerMatchFeePaymentDetails } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const ALLOWED_SELECTION_STATUSES = ["SELECTED", "BACKUP", "NOT_SELECTED"] as const;
type SelectionStatus = (typeof ALLOWED_SELECTION_STATUSES)[number];

const DEFAULT_PLAYER_MATCH_FEE_PENCE = Number.parseInt(
  process.env.DEFAULT_PLAYER_MATCH_FEE_PENCE ?? "600",
  10,
);

const selectionNotificationActiveStatuses = [
  NotificationDispatchStatus.QUEUED,
  NotificationDispatchStatus.PROCESSING,
  NotificationDispatchStatus.SENT,
];

function getSelectionStatus(value: FormDataEntryValue | null): SelectionStatus {
  const parsed = String(value ?? "").trim().toUpperCase();

  if (ALLOWED_SELECTION_STATUSES.includes(parsed as SelectionStatus)) {
    return parsed as SelectionStatus;
  }

  return "NOT_SELECTED";
}

function buildSelectionRedirect(teamid: string, fixtureId: string, query: string) {
  return `/captain/team/${teamid}/fixtures/${fixtureId}/selection${query}`;
}

function formatFixtureDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getDefaultMatchFeePence() {
  return Number.isFinite(DEFAULT_PLAYER_MATCH_FEE_PENCE)
    ? DEFAULT_PLAYER_MATCH_FEE_PENCE
    : 600;
}

async function getPlayerMatchFeeAmountPence(teamMemberId: string) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "TeamMemberProfile"
        ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;
    `);

    const rows = await prisma.$queryRaw<Array<{ playerMatchFeePenceOverride: number | null }>>`
      SELECT "playerMatchFeePenceOverride"
      FROM "TeamMemberProfile"
      WHERE "teamMemberId" = ${teamMemberId}
      LIMIT 1
    `;

    const override = rows[0]?.playerMatchFeePenceOverride;

    if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
      return override;
    }
  } catch {
    return getDefaultMatchFeePence();
  }

  return getDefaultMatchFeePence();
}

function getFirstName(nameOrEmail: string) {
  return nameOrEmail.trim().split(/\s+/)[0] || "there";
}

function getMatchdayReminderTime(kickoffAt: Date) {
  const scheduledFor = new Date(kickoffAt.getTime() - 8 * 60 * 60 * 1000);

  if (scheduledFor.getTime() <= Date.now()) {
    return new Date();
  }

  return scheduledFor;
}

function getSelectionSourceId(input: {
  fixtureId: string;
  teamMemberId: string;
  kind: "selected" | "matchday-reminder";
}) {
  return `${input.fixtureId}:${input.teamMemberId}:${input.kind}`;
}

async function hasSelectionNotification(input: {
  sourceType: string;
  sourceId: string;
}) {
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: {
        in: selectionNotificationActiveStatuses,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

async function cancelQueuedSelectionNotifications(input: {
  fixtureId: string;
  teamMemberId: string;
}) {
  await prisma.notificationDispatch.updateMany({
    where: {
      sourceType: {
        in: ["FIXTURE_SELECTION_SELECTED", "FIXTURE_SELECTION_MATCHDAY_REMINDER"],
      },
      sourceId: {
        in: [
          getSelectionSourceId({
            fixtureId: input.fixtureId,
            teamMemberId: input.teamMemberId,
            kind: "selected",
          }),
          getSelectionSourceId({
            fixtureId: input.fixtureId,
            teamMemberId: input.teamMemberId,
            kind: "matchday-reminder",
          }),
        ],
      },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: "Player was removed from the selected squad before the message was sent.",
    },
  });
}

async function queueSelectedSquadEmails(input: {
  fixtureId: string;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  fixtureLabel: string;
  fixtureDateTime: string;
  venueName: string;
  kickoffAt: Date;
  teamMemberId: string;
  playerName: string;
  email: string | null;
  createdByUserId: string | null;
}) {
  if (!input.email?.trim()) return;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `fixture-selection:${input.fixtureId}:${input.teamMemberId}`,
    audience: NotificationAudience.PLAYER,
    displayName: input.playerName,
    email: input.email,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      entityType: "FIXTURE_SELECTION",
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      teamMemberId: input.teamMemberId,
    },
  });

  const firstName = getFirstName(input.playerName || input.email);
  const variables = {
    firstName,
    fullName: input.playerName,
    teamName: input.teamName,
    fixtureName: input.fixtureLabel,
    fixtureDateTime: input.fixtureDateTime,
    venueName: input.venueName,
  };

  const selectedSourceId = getSelectionSourceId({
    fixtureId: input.fixtureId,
    teamMemberId: input.teamMemberId,
    kind: "selected",
  });

  if (
    !(await hasSelectionNotification({
      sourceType: "FIXTURE_SELECTION_SELECTED",
      sourceId: selectedSourceId,
    }))
  ) {
    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "You have been selected for {{fixtureName}}",
      body: [
        "Hi {{firstName}},",
        "",
        "You have been selected in the {{teamName}} squad for {{fixtureName}}.",
        "",
        "Kick-off: {{fixtureDateTime}}",
        "Venue: {{venueName}}",
        "",
        "Please arrive in good time and let the organiser know as soon as possible if anything changes.",
      ].join("\n"),
      sourceType: "FIXTURE_SELECTION_SELECTED",
      sourceId: selectedSourceId,
      variables,
      metadata: {
        origin: "fixture_selection",
        fixtureId: input.fixtureId,
        teamId: input.teamId,
        teamMemberId: input.teamMemberId,
      },
      emailBranding: {
        teamName: input.teamName,
        teamLogoUrl: input.teamLogoUrl,
      },
      scheduledFor: new Date(),
      createdByUserId: input.createdByUserId,
    });
  }

  const reminderSourceId = getSelectionSourceId({
    fixtureId: input.fixtureId,
    teamMemberId: input.teamMemberId,
    kind: "matchday-reminder",
  });

  if (
    !(await hasSelectionNotification({
      sourceType: "FIXTURE_SELECTION_MATCHDAY_REMINDER",
      sourceId: reminderSourceId,
    }))
  ) {
    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: "Matchday reminder for {{fixtureName}}",
      body: [
        "Hi {{firstName}},",
        "",
        "Reminder: you are selected for {{teamName}} today for {{fixtureName}}.",
        "",
        "Kick-off: {{fixtureDateTime}}",
        "Venue: {{venueName}}",
        "",
        "See you there.",
      ].join("\n"),
      sourceType: "FIXTURE_SELECTION_MATCHDAY_REMINDER",
      sourceId: reminderSourceId,
      variables,
      metadata: {
        origin: "fixture_selection_matchday_reminder",
        fixtureId: input.fixtureId,
        teamId: input.teamId,
        teamMemberId: input.teamMemberId,
      },
      emailBranding: {
        teamName: input.teamName,
        teamLogoUrl: input.teamLogoUrl,
      },
      scheduledFor: getMatchdayReminderTime(input.kickoffAt),
      createdByUserId: input.createdByUserId,
    });
  }
}

async function syncPlayerMatchFeeForSelection(input: {
  fixtureId: string;
  teamId: string;
  teamMemberId: string;
  selectionStatus: SelectionStatus;
}) {
  const existingFee = await prisma.playerMatchFee.findFirst({
    where: {
      fixtureId: input.fixtureId,
      teamMemberId: input.teamMemberId,
    },
    select: {
      id: true,
      status: true,
      note: true,
    },
  });

  if (input.selectionStatus !== "SELECTED") {
    await cancelQueuedSelectionNotifications({
      fixtureId: input.fixtureId,
      teamMemberId: input.teamMemberId,
    });

    if (existingFee?.status === "OPEN") {
      await prisma.playerMatchFee.update({
        where: { id: existingFee.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          note: [
            existingFee.note,
            "Cancelled automatically because the player was removed from the selected squad.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });

      await cancelQueuedPlayerMatchFeeNotificationDispatches(
        [existingFee.id],
        "Player was removed from the selected squad before the fee was chased.",
      );
    }

    return null;
  }

  const amountPence = await getPlayerMatchFeeAmountPence(input.teamMemberId);

  if (existingFee) {
    if (existingFee.status === "PAID") {
      return existingFee.id;
    }

    const updatedFee = await prisma.playerMatchFee.update({
      where: { id: existingFee.id },
      data: {
        teamId: input.teamId,
        amountPence,
        status: "OPEN",
        cancelledAt: null,
        waivedAt: null,
        note:
          amountPence === 0
            ? "Auto-created as a free player match fee because this player has a £0 override."
            : existingFee.note ?? "Auto-created when player was selected for the fixture.",
      },
      select: { id: true },
    });

    if (amountPence > 0) {
      await ensurePlayerMatchFeePaymentDetails(updatedFee.id);
    }
    return updatedFee.id;
  }

  const createdFee = await prisma.playerMatchFee.create({
    data: {
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      teamMemberId: input.teamMemberId,
      amountPence,
      note:
        amountPence === 0
          ? "Auto-created as a free player match fee because this player has a £0 override."
          : `Auto-created when player was selected for the fixture. Chase after the match only. Amount: ${formatMoney(
              amountPence,
            )}`,
    },
    select: { id: true },
  });

  if (amountPence > 0) {
    await ensurePlayerMatchFeePaymentDetails(createdFee.id);
  }
  return createdFee.id;
}

export async function updateFixtureSelectionAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const selectionStatus = getSelectionStatus(formData.get("selectionStatus"));
  const isCaptain = String(formData.get("isCaptain") ?? "") === "on";
  const isGoalkeeper = String(formData.get("isGoalkeeper") ?? "") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

  const access = await requireCaptain(teamid);

  if (!teamid || !fixtureId || !teamMemberId) {
    redirect("/captain");
  }

  const [fixture, membership] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        ...publishedFixtureWhere,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: {
        id: true,
        kickoffAt: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        venue: { select: { name: true } },
      },
    }),
    prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        teamId: teamid,
      },
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    }),
  ]);

  if (!fixture) {
    redirect(buildSelectionRedirect(teamid, fixtureId, "?error=Fixture%20not%20found."));
  }

  if (!membership) {
    redirect(buildSelectionRedirect(teamid, fixtureId, "?error=Team%20member%20not%20found."));
  }

  await prisma.$transaction(async (tx) => {
    if (isCaptain) {
      await tx.fixtureSelection.updateMany({
        where: {
          fixtureId,
          isCaptain: true,
        },
        data: {
          isCaptain: false,
        },
      });
    }

    await tx.fixtureSelection.upsert({
      where: {
        fixtureId_teamMemberId: {
          fixtureId,
          teamMemberId,
        },
      },
      update: {
        selectionStatus,
        isCaptain,
        isGoalkeeper,
        note,
      },
      create: {
        fixtureId,
        teamMemberId,
        selectionStatus,
        isCaptain,
        isGoalkeeper,
        note,
      },
    });
  });

  await syncPlayerMatchFeeForSelection({
    fixtureId,
    teamId: teamid,
    teamMemberId,
    selectionStatus,
  });

  if (selectionStatus === "SELECTED") {
    await queueSelectedSquadEmails({
      fixtureId,
      teamId: teamid,
      teamName: membership.team.name,
      teamLogoUrl: membership.team.logoUrl,
      fixtureLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      fixtureDateTime: formatFixtureDateTime(fixture.kickoffAt),
      venueName: fixture.venue?.name ?? "Venue TBC",
      kickoffAt: fixture.kickoffAt,
      teamMemberId,
      playerName: membership.user.name || membership.user.email || "Player",
      email: membership.user.email,
      createdByUserId: access.user?.id ?? null,
    });
  }

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);
  revalidatePath(`/captain/team/${teamid}/match-fees`);
  redirect(buildSelectionRedirect(teamid, fixtureId, "?saved=selection-updated"));
}
