// ========================================
// File: src/app/captain/team/[teamid]/match-fees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import {
  addPlayerMatchFeeCreditFromFee,
  applyAvailablePlayerMatchFeeCreditToFee,
} from "@/lib/payments/player-match-fee-credits";
import { queuePlayerMatchFeeReminder } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const DEFAULT_PLAYER_MATCH_FEE_PENCE = 600;

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getMatchFeesPath(teamId: string, fixtureId?: string, suffix = "") {
  const query = fixtureId
    ? `?fixtureId=${encodeURIComponent(fixtureId)}${suffix}`
    : suffix;

  return `/captain/team/${teamId}/match-fees${query}`;
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

  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return Math.round(numeric * 100);
}

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
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

function getOverrideNote(amountPence: number) {
  return amountPence === 0
    ? "Player match fee override: £0.00"
    : `Player match fee override: £${(amountPence / 100).toFixed(2)}`;
}

function getRemovedFromCurrentSelectionNote(wasPaid: boolean) {
  return wasPaid
    ? "Paid fee cancelled because the player was removed from the matchday squad. Payment retained for audit and player credit created."
    : "Unpaid fee cancelled because the player was removed from the matchday squad. No payment was taken and no credit is due.";
}

function getAdminCancelledNote(wasPaid: boolean) {
  return wasPaid
    ? "Fee cancelled by SIXFL admin. Payment retained for audit and player credit created."
    : "Unpaid fee cancelled by SIXFL admin. No payment was taken and no credit is due.";
}

async function assertFixtureBelongsToTeam(input: { fixtureId: string; teamId: string }) {
  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });

  return Boolean(fixture);
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

function isClosedPlayerFee(status: PlayerMatchFeeStatus) {
  return status === "PAID";
}

async function applyCreditToFeeIfOpen(feeId: string, status: PlayerMatchFeeStatus) {
  if (status !== "OPEN") return;
  await applyAvailablePlayerMatchFeeCreditToFee({ feeId });
}

async function creditCancelledPaidFee(input: {
  feeId: string;
  wasPaid: boolean;
  reason: string;
}) {
  if (!input.wasPaid) return;
  await addPlayerMatchFeeCreditFromFee({
    feeId: input.feeId,
    description: input.reason,
  });
}

export async function createCaptainPlayerMatchFeesAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const access = teamId ? await requireCaptain(teamId) : null;
  const players = getSelectedPlayers(formData);

  if (!teamId || !fixtureId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  const defaultAmountPence = access?.isAdmin
    ? parseAmountPence(getString(formData, "amount"))
    : DEFAULT_PLAYER_MATCH_FEE_PENCE;

  if (!defaultAmountPence) {
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
  const profileByMemberId = await getTeamMemberProfilesByTeamMemberIds(selectedMemberIds);
  const baseNote = access?.isAdmin
    ? getString(formData, "note") || null
    : "Submitted by captain";

  for (const player of players) {
    if (player.type === "member") {
      const member = await prisma.teamMember.findFirst({
        where: { id: player.id, teamId },
        select: { id: true },
      });

      if (!member) continue;

      const override = profileByMemberId.get(player.id)?.playerMatchFeePenceOverride;
      const hasOverride = typeof override === "number";
      const amountPence = hasOverride ? override : defaultAmountPence;
      const status: PlayerMatchFeeStatus = amountPence === 0 ? "WAIVED" : "OPEN";
      const note = hasOverride
        ? appendNote({ existingNote: baseNote, note: getOverrideNote(amountPence) })
        : baseNote;
      const now = new Date();

      const existing = await prisma.playerMatchFee.findFirst({
        where: { fixtureId, teamMemberId: player.id },
        select: { id: true, status: true },
      });

      if (existing && isClosedPlayerFee(existing.status)) {
        continue;
      }

      const data = {
        amountPence,
        teamId,
        note,
        status,
        paidAt: null,
        waivedAt: amountPence === 0 ? now : null,
        cancelledAt: null,
        paymentUrl: amountPence === 0 ? null : undefined,
        paymentToken: amountPence === 0 ? null : undefined,
      };

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              teamId,
              teamMemberId: player.id,
              amountPence,
              note,
              status,
              waivedAt: amountPence === 0 ? now : null,
            },
            select: { id: true },
          });

      await applyCreditToFeeIfOpen(fee.id, status);
    }

    if (player.type === "prospect") {
      const prospect = await prisma.teamPlayerProspect.findFirst({
        where: { id: player.id, teamId },
        select: { id: true },
      });

      if (!prospect) continue;

      const existing = await prisma.playerMatchFee.findFirst({
        where: { fixtureId, prospectId: player.id },
        select: { id: true, status: true },
      });

      if (existing && isClosedPlayerFee(existing.status)) {
        continue;
      }

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data: {
              amountPence: defaultAmountPence,
              teamId,
              note: baseNote,
              status: "OPEN",
              paidAt: null,
              waivedAt: null,
              cancelledAt: null,
            },
            select: { id: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              teamId,
              prospectId: player.id,
              amountPence: defaultAmountPence,
              note: baseNote,
            },
            select: { id: true },
          });

      await applyAvailablePlayerMatchFeeCreditToFee({ feeId: fee.id });
    }
  }

  const removableFees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: { not: "CANCELLED" },
      OR: [{ teamMemberId: { not: null } }, { prospectId: { not: null } }],
    },
    select: {
      id: true,
      note: true,
      status: true,
      teamMemberId: true,
      prospectId: true,
    },
  });

  const removedFeeIds: string[] = [];

  for (const fee of removableFees) {
    const isSelectedMember = fee.teamMemberId
      ? selectedMemberIds.includes(fee.teamMemberId)
      : false;
    const isSelectedProspect = fee.prospectId
      ? selectedProspectIds.includes(fee.prospectId)
      : false;

    if (isSelectedMember || isSelectedProspect) continue;

    const wasPaid = fee.status === "PAID";
    await creditCancelledPaidFee({
      feeId: fee.id,
      wasPaid,
      reason: "Credit from paid player removed from current/rescheduled matchday selection.",
    });

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: wasPaid ? undefined : null,
        waivedAt: null,
        cancelledAt: new Date(),
        paymentUrl: null,
        paymentToken: null,
        note: appendNote({
          existingNote: fee.note,
          note: getRemovedFromCurrentSelectionNote(wasPaid),
        }),
      },
    });

    removedFeeIds.push(fee.id);
  }

  if (removedFeeIds.length > 0) {
    await cancelQueuedPlayerMatchFeeNotificationDispatches(
      removedFeeIds,
      "Player removed from current matchday selection.",
    );
  }

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(`/captain/team/${teamId}/availability`);
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
    where: { id: feeId, teamId, fixtureId },
    select: { id: true, note: true },
  });

  if (!existingFee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  await prisma.playerMatchFee.update({
    where: { id: existingFee.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      waivedAt: null,
      cancelledAt: null,
      note: appendNote({
        existingNote: existingFee.note,
        note: getPaidMethodNote(method),
      }),
    },
  });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(`/captain/team/${teamId}/availability`);
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

  const existingFee = await prisma.playerMatchFee.findFirst({
    where: { id: feeId, teamId, fixtureId },
    select: { id: true, status: true, note: true },
  });

  if (!existingFee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  const now = new Date();
  const wasPaid = existingFee.status === "PAID";

  if (status === "CANCELLED") {
    await creditCancelledPaidFee({
      feeId: existingFee.id,
      wasPaid,
      reason: "Credit from paid player fee cancelled by admin.",
    });
  }

  await prisma.playerMatchFee.update({
    where: { id: existingFee.id },
    data: {
      status,
      paidAt:
        status === "PAID"
          ? now
          : status === "CANCELLED" && wasPaid
            ? undefined
            : null,
      waivedAt: status === "WAIVED" ? now : null,
      cancelledAt: status === "CANCELLED" ? now : null,
      paymentUrl:
        status === "WAIVED" || status === "CANCELLED" ? null : undefined,
      paymentToken:
        status === "WAIVED" || status === "CANCELLED" ? null : undefined,
      note:
        status === "CANCELLED"
          ? appendNote({
              existingNote: existingFee.note,
              note: getAdminCancelledNote(wasPaid),
            })
          : undefined,
    },
  });

  if (status === "CANCELLED") {
    await cancelQueuedPlayerMatchFeeNotificationDispatches([feeId]);
  }

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(`/captain/team/${teamId}/availability`);
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
    where: { id: feeId, teamId, fixtureId },
    select: { id: true, status: true },
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
  const reason =
    getString(formData, "reason") || "Game conceded / fixture not played";

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
      status: { in: ["OPEN", "WAIVED", "CANCELLED", "PAID"] },
    },
    select: { id: true, note: true, status: true },
  });

  for (const fee of fees) {
    const wasPaid = fee.status === "PAID";
    await creditCancelledPaidFee({
      feeId: fee.id,
      wasPaid,
      reason: `Credit from paid player fee cancelled: ${reason}`,
    });

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: wasPaid ? undefined : null,
        waivedAt: null,
        cancelledAt: new Date(),
        paymentUrl: null,
        paymentToken: null,
        note: appendNote({
          existingNote: fee.note,
          note: wasPaid
            ? `Fixture fee cancelled: ${reason}. Previous payment retained for audit and player credit created.`
            : `Fixture fee cancelled: ${reason}. No payment was taken and no credit is due.`,
        }),
      },
    });
  }

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    fees.map((fee) => fee.id),
    `Player match fees cancelled: ${reason}`,
  );

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(`/captain/team/${teamId}/availability`);
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

  const existingFee = await prisma.playerMatchFee.findFirst({
    where: { id: feeId, teamId, fixtureId },
    select: { id: true, status: true },
  });

  if (!existingFee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  if (existingFee.status === "PAID") {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fee_locked"));
  }

  await prisma.playerMatchFee.update({
    where: { id: existingFee.id },
    data: { amountPence },
  });

  await applyAvailablePlayerMatchFeeCreditToFee({ feeId: existingFee.id });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(`/captain/team/${teamId}/availability`);
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}
