// ========================================
// File: src/app/captain/team/[teamid]/match-fees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { queuePlayerMatchFeeReminder } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const DEFAULT_PLAYER_MATCH_FEE_PENCE = 600;

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

  const fixtureOk = await assertFixtureBelongsToTeam({ fixtureId, teamId });

  if (!fixtureOk) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fixture_not_found"));
  }

  const selectedMemberIds = players
    .filter((player) => player.type === "member")
    .map((player) => player.id);
  const selectedProspectIds = players
    .filter((player) => player.type === "prospect")
    .map((player) => player.id);

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
