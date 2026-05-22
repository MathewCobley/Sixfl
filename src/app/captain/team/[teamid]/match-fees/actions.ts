// ========================================
// File: src/app/captain/team/[teamid]/match-fees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationRecipientSourceType,
  type PlayerMatchFeeStatus,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { queuePlayerMatchFeeReminder } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const DEFAULT_PLAYER_MATCH_FEE_PENCE = 600;
const MATCHDAY_SQUAD_SELECTED_SOURCE_TYPE = "MATCHDAY_SQUAD_SELECTED";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getSelectedPlayers(formData: FormData) {
  return formData
    .getAll("player")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => {
      const [type, id] = value.split(":");
      return { type, id };
    })
    .filter(
      (value) =>
        (value.type === "member" || value.type === "prospect") &&
        Boolean(value.id),
    );
}

function parseAmountPence(value: string) {
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function getMatchFeesPath(teamId: string, fixtureId?: string, suffix = "") {
  const query = fixtureId
    ? `?fixtureId=${encodeURIComponent(fixtureId)}${suffix}`
    : suffix;

  return `/captain/team/${teamId}/match-fees${query}`;
}

async function assertFixtureBelongsToTeam(input: {
  fixtureId: string;
  teamId: string;
}) {
  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });

  return Boolean(fixture);
}

function getPaidMethodNote(method: string) {
  switch (method) {
    case "CASH":
      return "Paid cash";
    case "ONLINE":
      return "Paid online/manual";
    case "CARD":
      return "Paid by card";
    case "BANK_TRANSFER":
      return "Paid by bank transfer";
    default:
      return "Paid manually";
  }
}

function mergePaymentNote(input: {
  existingNote: string | null;
  methodNote: string;
}) {
  const existingNote = input.existingNote?.trim();

  if (!existingNote) {
    return input.methodNote;
  }

  if (existingNote.includes(input.methodNote)) {
    return existingNote;
  }

  return `${existingNote}\n${input.methodNote}`;
}

function appendVoidNote(input: {
  existingNote: string | null;
  reason: string;
}) {
  const existingNote = input.existingNote?.trim();
  const voidNote = `Voided: ${input.reason}`;

  if (!existingNote) return voidNote;
  if (existingNote.includes(voidNote)) return existingNote;

  return `${existingNote}\n${voidNote}`;
}

function redirectIfNotAdmin(input: {
  isAdmin: boolean;
  teamId: string;
  fixtureId?: string;
}) {
  if (!input.isAdmin) {
    redirect(getMatchFeesPath(input.teamId, input.fixtureId, "&error=admin_only"));
  }
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

function getPlayerDisplayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function formatSquadMessageFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSquadSelectedSourceId(input: { fixtureId: string; teamMemberId: string }) {
  return `${input.fixtureId}:${input.teamMemberId}`;
}

async function processSquadSelectedMessagesNow(queuedCount: number) {
  if (queuedCount < 1) return;

  try {
    await processNotificationQueue(Math.max(queuedCount + 5, 10));
  } catch (error) {
    console.error("Failed to process matchday squad selected SMS immediately", error);
  }
}

async function sendMatchdaySquadSelectedSms(input: {
  teamId: string;
  fixture: {
    id: string;
    leagueId: string;
    kickoffAt: Date;
    homeTeamId: string;
    awayTeamId: string;
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
    venue: { name: string } | null;
  };
  teamMemberIds: string[];
  createdByUserId?: string | null;
}) {
  const uniqueMemberIds = Array.from(new Set(input.teamMemberIds)).filter(Boolean);

  if (uniqueMemberIds.length === 0) return;

  const existingSourceIds = new Set(
    (
      await prisma.notificationDispatch.findMany({
        where: {
          sourceType: MATCHDAY_SQUAD_SELECTED_SOURCE_TYPE,
          sourceId: {
            in: uniqueMemberIds.map((teamMemberId) =>
              getSquadSelectedSourceId({ fixtureId: input.fixture.id, teamMemberId }),
            ),
          },
        },
        select: {
          sourceId: true,
        },
      })
    )
      .map((dispatch) => dispatch.sourceId)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );

  const members = await prisma.teamMember.findMany({
    where: {
      id: {
        in: uniqueMemberIds,
      },
      teamId: input.teamId,
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const profiles = await getTeamMemberProfilesByTeamMemberIds(
    members.map((member) => member.id),
  );

  const isHome = input.fixture.homeTeamId === input.teamId;
  const team = isHome ? input.fixture.homeTeam : input.fixture.awayTeam;
  const opponent = isHome ? input.fixture.awayTeam : input.fixture.homeTeam;
  const fixtureLabel = `${team.name} vs ${opponent.name} · ${formatSquadMessageFixtureDate(input.fixture.kickoffAt)}`;
  const venueText = input.fixture.venue?.name ? ` at ${input.fixture.venue.name}` : "";
  let queuedCount = 0;

  for (const member of members) {
    const sourceId = getSquadSelectedSourceId({
      fixtureId: input.fixture.id,
      teamMemberId: member.id,
    });

    if (existingSourceIds.has(sourceId)) continue;

    const profile = profiles.get(member.id) ?? null;
    const phone = profile?.phone?.trim() || null;
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!phone || !normalizedPhone) continue;

    const playerName = getPlayerDisplayName(member.user);
    const recipient = await upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: `team-member:${member.id}`,
      audience: NotificationAudience.PLAYER,
      displayName: playerName,
      email: member.user.email?.trim() || null,
      phone,
      marketingEmailOptIn: true,
      marketingSmsOptIn: true,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamMemberId: member.id,
        userId: member.user.id,
        entityType: "TEAM_MEMBER",
      },
    });

    await prisma.notificationPreference.upsert({
      where: { recipientId: recipient.id },
      update: { smsEnabled: true, urgentSmsEnabled: true },
      create: {
        recipientId: recipient.id,
        emailEnabled: true,
        smsEnabled: true,
        urgentSmsEnabled: true,
      },
    });

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: "SMS",
      audience: NotificationAudience.PLAYER,
      body: `SIXFL: Hi ${getFirstName(playerName)}, you are in the matchday squad for ${fixtureLabel}${venueText}. If this creates a problem, contact SIXFL as soon as possible.`,
      sourceType: MATCHDAY_SQUAD_SELECTED_SOURCE_TYPE,
      sourceId,
      metadata: {
        origin: "matchday_squad_selected",
        originLabel: "Player picked for matchday squad",
        teamId: input.teamId,
        fixtureId: input.fixture.id,
        teamMemberId: member.id,
        userId: member.user.id,
        leagueId: input.fixture.leagueId,
        fixtureLabel,
        venueName: input.fixture.venue?.name ?? null,
      },
      createdByUserId: input.createdByUserId?.trim() || null,
    });

    if (dispatch.status === "QUEUED") queuedCount += 1;
  }

  await processSquadSelectedMessagesNow(queuedCount);
}

export async function createCaptainPlayerMatchFeesAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");

  const access = teamId ? await requireCaptain(teamId) : null;
  const amountPence = access?.isAdmin
    ? parseAmountPence(getString(formData, "amount"))
    : DEFAULT_PLAYER_MATCH_FEE_PENCE;
  const note = access?.isAdmin ? getString(formData, "note") || null : "Submitted by captain";
  const players = getSelectedPlayers(formData);

  if (!teamId || !fixtureId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  if (!amountPence) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=invalid_amount"));
  }

  if (players.length === 0) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=no_players"));
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
    },
  });

  if (!fixture) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fixture_not_found"));
  }

  const selectedMemberIds = players
    .filter((player) => player.type === "member")
    .map((player) => player.id);
  const selectedProspectIds = players
    .filter((player) => player.type === "prospect")
    .map((player) => player.id);

  const existingActiveMemberFeeRows = selectedMemberIds.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId,
          fixtureId,
          status: { not: "CANCELLED" },
          teamMemberId: {
            in: selectedMemberIds,
          },
        },
        select: {
          teamMemberId: true,
        },
      })
    : [];

  const existingActiveMemberIds = new Set(
    existingActiveMemberFeeRows
      .map((fee) => fee.teamMemberId)
      .filter((id): id is string => Boolean(id)),
  );

  const newlySelectedMemberIds = selectedMemberIds.filter(
    (teamMemberId) => !existingActiveMemberIds.has(teamMemberId),
  );

  for (const player of players) {
    if (player.type === "member") {
      const member = await prisma.teamMember.findFirst({
        where: {
          id: player.id,
          teamId,
        },
        select: { id: true },
      });

      if (!member) continue;

      const existing = await prisma.playerMatchFee.findFirst({
        where: {
          fixtureId,
          teamMemberId: player.id,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence,
            teamId,
            note,
            status: "OPEN",
            cancelledAt: null,
            waivedAt: null,
          },
        });
      } else {
        await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            teamMemberId: player.id,
            amountPence,
            note,
          },
        });
      }
    }

    if (player.type === "prospect") {
      const prospect = await prisma.teamPlayerProspect.findFirst({
        where: {
          id: player.id,
          teamId,
        },
        select: { id: true },
      });

      if (!prospect) continue;

      const existing = await prisma.playerMatchFee.findFirst({
        where: {
          fixtureId,
          prospectId: player.id,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence,
            teamId,
            note,
            status: "OPEN",
            cancelledAt: null,
            waivedAt: null,
          },
        });
      } else {
        await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            prospectId: player.id,
            amountPence,
            note,
          },
        });
      }
    }
  }

  const removableFees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: { not: "PAID" },
      OR: [
        { teamMemberId: { not: null } },
        { prospectId: { not: null } },
      ],
    },
    select: {
      id: true,
      note: true,
      teamMemberId: true,
      prospectId: true,
    },
  });

  for (const fee of removableFees) {
    const isSelectedMember = fee.teamMemberId
      ? selectedMemberIds.includes(fee.teamMemberId)
      : false;
    const isSelectedProspect = fee.prospectId
      ? selectedProspectIds.includes(fee.prospectId)
      : false;

    if (isSelectedMember || isSelectedProspect) continue;

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: null,
        waivedAt: null,
        cancelledAt: new Date(),
        note: appendVoidNote({
          existingNote: fee.note,
          reason: "Removed from matchday squad selection",
        }),
      },
    });
  }

  await sendMatchdaySquadSelectedSms({
    teamId,
    fixture,
    teamMemberIds: newlySelectedMemberIds,
    createdByUserId: access?.user?.id ?? null,
  });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fees_created"));
}

export async function markCaptainPlayerMatchFeePaidAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");
  const method = getString(formData, "method");

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId || !feeId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  const existingFee = await prisma.playerMatchFee.findFirst({
    where: {
      id: feeId,
      teamId,
      fixtureId,
    },
    select: {
      id: true,
      note: true,
    },
  });

  if (!existingFee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  const now = new Date();
  const methodNote = getPaidMethodNote(method);

  await prisma.playerMatchFee.update({
    where: { id: existingFee.id },
    data: {
      status: "PAID",
      paidAt: now,
      waivedAt: null,
      cancelledAt: null,
      note: mergePaymentNote({
        existingNote: existingFee.note,
        methodNote,
      }),
    },
  });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}

export async function updateCaptainPlayerMatchFeeStatusAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");
  const status = getString(formData, "status") as PlayerMatchFeeStatus;

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId || !feeId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  if (!["OPEN", "PAID", "WAIVED", "CANCELLED"].includes(status)) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=invalid_status"));
  }

  const now = new Date();

  await prisma.playerMatchFee.updateMany({
    where: {
      id: feeId,
      teamId,
      fixtureId,
    },
    data: {
      status,
      paidAt: status === "PAID" ? now : null,
      waivedAt: status === "WAIVED" ? now : null,
      cancelledAt: status === "CANCELLED" ? now : null,
    },
  });

  if (status === "CANCELLED") {
    await cancelQueuedPlayerMatchFeeNotificationDispatches([feeId]);
  }

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}

export async function sendCaptainPlayerMatchFeeReminderAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId || !feeId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  const fee = await prisma.playerMatchFee.findFirst({
    where: {
      id: feeId,
      teamId,
      fixtureId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!fee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  if (fee.status !== "OPEN") {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fee_not_open"));
  }

  const reminderModes = ["request", "chase24h", "chase72h"] as const;

  for (const mode of reminderModes) {
    const result = await queuePlayerMatchFeeReminder({
      feeId: fee.id,
      mode,
      channels: ["SMS"],
    });

    if (result.queued > 0) {
      revalidatePath(getMatchFeesPath(teamId, fixtureId));
      redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_sms_queued"));
    }

    if (["no_contact", "not_open", "no_payment_url"].includes(result.status)) {
      redirect(getMatchFeesPath(teamId, fixtureId, `&error=${result.status}`));
    }
  }

  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_sms_already_sent"));
}

export async function voidCaptainFixturePlayerMatchFeesAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const reason = getString(formData, "reason") || "Game conceded / fixture not played";

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  const fixtureOk = await assertFixtureBelongsToTeam({ fixtureId, teamId });

  if (!fixtureOk) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fixture_not_found"));
  }

  const fees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: {
        in: ["OPEN", "WAIVED", "CANCELLED"],
      },
    },
    select: {
      id: true,
      note: true,
    },
  });

  for (const fee of fees) {
    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: null,
        waivedAt: null,
        cancelledAt: new Date(),
        note: appendVoidNote({
          existingNote: fee.note,
          reason,
        }),
      },
    });
  }

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    fees.map((fee) => fee.id),
    `Player match fees voided: ${reason}`,
  );

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}

export async function updateCaptainPlayerMatchFeeAmountAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");
  const amountPence = parseAmountPence(getString(formData, "amount"));

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId || !feeId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  if (!amountPence) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=invalid_amount"));
  }

  await prisma.playerMatchFee.updateMany({
    where: {
      id: feeId,
      teamId,
      fixtureId,
    },
    data: {
      amountPence,
    },
  });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}
