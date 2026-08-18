// ========================================
// File: src/app/captain/team/[teamid]/player-payments/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import {
  ensurePlayerMatchFeePaymentDetailsForFees,
  queuePlayerMatchFeeReminder,
} from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getPlayerPaymentsPath(teamId: string, fixtureId?: string, suffix = "") {
  const query = fixtureId
    ? `?fixtureId=${encodeURIComponent(fixtureId)}${suffix}`
    : suffix;

  return `/captain/team/${teamId}/player-payments${query}`;
}

function parseAmountPence(value: string, options?: { allowZero?: boolean }) {
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return null;
  if (!options?.allowZero && numeric <= 0) return null;

  return Math.round(numeric * 100);
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
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

function getPlayerAmountPence(input: {
  formData: FormData;
  type: string;
  id: string;
  defaultAmountPence: number;
}) {
  const fieldName = `amount_${input.type}_${input.id}`;
  const rawValue = getString(input.formData, fieldName);

  if (!rawValue) return input.defaultAmountPence;

  return parseAmountPence(rawValue, { allowZero: true });
}

type CaptainCollectionMethod = "link" | "captain_paid" | "waived";

function getCollectionMethod(input: {
  formData: FormData;
  type: string;
  id: string;
  amountPence: number;
  forceWaived?: boolean;
}): CaptainCollectionMethod {
  if (input.forceWaived) return "waived";

  const rawValue = getString(input.formData, `collection_${input.type}_${input.id}`);

  if (rawValue === "captain_paid") return "captain_paid";
  if (rawValue === "waived") return "waived";
  if (input.amountPence === 0) return "waived";

  return "link";
}

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
}

const COLLECTION_NOTE_PREFIXES = [
  "SIXFL player payment link:",
  "No individual player payment link:",
  "No player link needed:",
  ZERO_FEE_WAIVER_NOTE,
] as const;

function replaceCollectionNote(existingNote: string | null, nextNote: string) {
  const preservedLines = (existingNote ?? "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        Boolean(trimmed) &&
        !COLLECTION_NOTE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
      );
    });

  // OPEN payment-link state is already represented by structured fields
  // (status, amountPence, paymentUrl/paymentToken), so do not duplicate it in note.
  if (!nextNote.startsWith("SIXFL player payment link:")) {
    preservedLines.push(nextNote);
  }

  return preservedLines.length > 0 ? preservedLines.join("\n") : null;
}

function isLockedPlayerFee(status: PlayerMatchFeeStatus) {
  return status === "PAID";
}

function getCollectionNote(input: {
  amountPence: number;
  method: CaptainCollectionMethod;
  zeroFeePlayer?: boolean;
}) {
  if (input.zeroFeePlayer) {
    return `${ZERO_FEE_WAIVER_NOTE}: ${formatMoney(input.amountPence)}. Player fee override is £0.00, so this share reduces the team balance but is not counted as money collected.`;
  }

  if (input.method === "captain_paid") {
    return `No individual player payment link: captain/organiser marked this ${formatMoney(input.amountPence)} share as collected outside the player's SIXFL payment link.`;
  }

  if (input.method === "waived" || input.amountPence === 0) {
    return "No player link needed: waived / no charge.";
  }

  return `SIXFL player payment link: ${formatMoney(input.amountPence)} for this player.`;
}

function getNextStatus(method: CaptainCollectionMethod): PlayerMatchFeeStatus {
  return method === "link" ? "OPEN" : "WAIVED";
}

async function assertFixtureBelongsToTeam(input: { fixtureId: string; teamId: string }) {
  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });

  return Boolean(fixture);
}

async function syncTeamChargeForZeroFeeWaivers(input: {
  teamId: string;
  fixtureId: string;
}) {
  const [fixture, charge, waivedTotal] = await Promise.all([
    prisma.fixture.findUnique({
      where: { id: input.fixtureId },
      select: { matchFeePence: true },
    }),
    prisma.paymentCharge.findFirst({
      where: {
        teamId: input.teamId,
        fixtureId: input.fixtureId,
        status: { not: "VOID" },
      },
      select: {
        id: true,
        amountPence: true,
        description: true,
      },
    }),
    prisma.playerMatchFee.aggregate({
      where: {
        teamId: input.teamId,
        fixtureId: input.fixtureId,
        status: "WAIVED",
        note: { contains: ZERO_FEE_WAIVER_NOTE },
      },
      _sum: { amountPence: true },
    }),
  ]);

  if (!charge) return;

  const baseTeamChargePence = fixture?.matchFeePence ?? charge.amountPence;
  const zeroFeeWaivedPence = waivedTotal._sum.amountPence ?? 0;
  const adjustedAmountPence = Math.max(baseTeamChargePence - zeroFeeWaivedPence, 0);
  const adjustmentNote = zeroFeeWaivedPence > 0
    ? `Zero-fee player waiver adjustment: ${formatMoney(zeroFeeWaivedPence)} removed from team balance.`
    : "Zero-fee player waiver adjustment removed.";

  if (
    charge.amountPence === adjustedAmountPence &&
    (zeroFeeWaivedPence === 0 || charge.description?.includes(adjustmentNote))
  ) {
    return;
  }

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: {
      amountPence: adjustedAmountPence,
      description: appendNote({
        existingNote: charge.description,
        note: adjustmentNote,
      }),
    },
  });
}

async function emailPlayerPaymentLinks(feeIds: string[]) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));
  let queued = 0;
  let skipped = 0;

  for (const feeId of uniqueFeeIds) {
    const result = await queuePlayerMatchFeeReminder({
      feeId,
      mode: "request",
      channels: ["EMAIL"],
    });

    queued += result.queued;
    skipped += result.skipped;
  }

  return { queued, skipped };
}

export async function resendCaptainPlayerPaymentLinkAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");

  if (!teamId || !fixtureId || !feeId) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=payment_request_not_found"));
  }

  await requireCaptain(teamId);

  const fee = await prisma.playerMatchFee.findFirst({
    where: {
      id: feeId,
      teamId,
      fixtureId,
      status: "OPEN",
    },
    select: { id: true },
  });

  if (!fee) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=payment_request_not_found"));
  }

  const result = await queuePlayerMatchFeeReminder({
    feeId: fee.id,
    mode: "request",
    channels: ["EMAIL"],
    force: true,
  });

  revalidatePath(getPlayerPaymentsPath(teamId, fixtureId));

  if (result.queued > 0) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&saved=payment_link_resent"));
  }

  if (result.status === "no_contact") {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_player_email"));
  }

  redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=payment_link_not_sent"));
}

export async function createCaptainSquadPaymentCollectionAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const defaultAmountPence = parseAmountPence(getString(formData, "amount"));
  const players = getSelectedPlayers(formData);

  if (!teamId || !fixtureId) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  await requireCaptain(teamId);

  if (!defaultAmountPence) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=invalid_amount"));
  }

  if (players.length === 0) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=no_players"));
  }

  const selectedMemberIdsForEmailCheck = players
    .filter((player) => player.type === "member")
    .map((player) => player.id);
  const selectedProspectIdsForEmailCheck = players
    .filter((player) => player.type === "prospect")
    .map((player) => player.id);
  const [membersForEmailCheck, prospectsForEmailCheck] = await Promise.all([
    prisma.teamMember.findMany({
      where: { id: { in: selectedMemberIdsForEmailCheck }, teamId },
      select: { id: true, user: { select: { email: true } } },
    }),
    prisma.teamPlayerProspect.findMany({
      where: { id: { in: selectedProspectIdsForEmailCheck }, teamId },
      select: { id: true, email: true },
    }),
  ]);
  const memberEmailById = new Map(
    membersForEmailCheck.map((member) => [member.id, member.user.email?.trim() || null]),
  );
  const prospectEmailById = new Map(
    prospectsForEmailCheck.map((prospect) => [prospect.id, prospect.email?.trim() || null]),
  );

  for (const player of players) {
    const enteredAmountPence = getPlayerAmountPence({
      formData,
      type: player.type,
      id: player.id,
      defaultAmountPence,
    });
    if (enteredAmountPence === null) continue;

    const method = getCollectionMethod({
      formData,
      type: player.type,
      id: player.id,
      amountPence: enteredAmountPence,
    });
    const email = player.type === "member"
      ? memberEmailById.get(player.id)
      : prospectEmailById.get(player.id);

    if (method === "link" && !email) {
      redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_player_email"));
    }
  }

  const fixtureOk = await assertFixtureBelongsToTeam({ fixtureId, teamId });

  if (!fixtureOk) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=fixture_not_found"));
  }

  const selectedMemberIds = players
    .filter((player) => player.type === "member")
    .map((player) => player.id);
  const selectedProspectIds = players
    .filter((player) => player.type === "prospect")
    .map((player) => player.id);
  const profileByMemberId = await getTeamMemberProfilesByTeamMemberIds(selectedMemberIds);
  const createdOrUpdatedFeeIds: string[] = [];

  for (const player of players) {
    const enteredAmountPence = getPlayerAmountPence({
      formData,
      type: player.type,
      id: player.id,
      defaultAmountPence,
    });

    if (enteredAmountPence === null) {
      redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=invalid_player_amount"));
    }

    const zeroFeePlayer =
      player.type === "member" &&
      profileByMemberId.get(player.id)?.playerMatchFeePenceOverride === 0;
    const method = getCollectionMethod({
      formData,
      type: player.type,
      id: player.id,
      amountPence: enteredAmountPence,
      forceWaived: zeroFeePlayer,
    });
    const playerAmountPence = zeroFeePlayer
      ? enteredAmountPence
      : method === "waived"
        ? 0
        : enteredAmountPence;
    const nextStatus = getNextStatus(method);
    const now = new Date();
    const note = getCollectionNote({
      amountPence: playerAmountPence,
      method,
      zeroFeePlayer,
    });
    const clearPaymentLink = nextStatus !== "OPEN";

    if (method === "link" && playerAmountPence <= 0) {
      redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=invalid_player_amount"));
    }

    if (player.type === "member") {
      const member = await prisma.teamMember.findFirst({
        where: { id: player.id, teamId },
        select: { id: true },
      });

      if (!member) continue;

      const existing = await prisma.playerMatchFee.findFirst({
        where: { fixtureId, teamMemberId: player.id },
        select: { id: true, status: true, note: true },
      });

      if (existing && isLockedPlayerFee(existing.status)) continue;

      const data = {
        amountPence: playerAmountPence,
        teamId,
        status: nextStatus,
        paidAt: null,
        waivedAt: nextStatus === "WAIVED" ? now : null,
        cancelledAt: null,
        paymentUrl: clearPaymentLink ? null : undefined,
        paymentToken: clearPaymentLink ? null : undefined,
        note: replaceCollectionNote(existing?.note ?? null, note),
      };

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data,
            select: { id: true, status: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              teamMemberId: player.id,
              ...data,
            },
            select: { id: true, status: true },
          });

      if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
    }

    if (player.type === "prospect") {
      const prospect = await prisma.teamPlayerProspect.findFirst({
        where: { id: player.id, teamId },
        select: { id: true },
      });

      if (!prospect) continue;

      const existing = await prisma.playerMatchFee.findFirst({
        where: { fixtureId, prospectId: player.id },
        select: { id: true, status: true, note: true },
      });

      if (existing && isLockedPlayerFee(existing.status)) continue;

      const data = {
        amountPence: playerAmountPence,
        teamId,
        status: nextStatus,
        paidAt: null,
        waivedAt: nextStatus === "WAIVED" ? now : null,
        cancelledAt: null,
        paymentUrl: clearPaymentLink ? null : undefined,
        paymentToken: clearPaymentLink ? null : undefined,
        note: replaceCollectionNote(existing?.note ?? null, note),
      };

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data,
            select: { id: true, status: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              prospectId: player.id,
              ...data,
            },
            select: { id: true, status: true },
          });

      if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
    }
  }

  const removableFees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: { in: ["OPEN", "WAIVED", "CANCELLED"] },
      OR: [{ teamMemberId: { not: null } }, { prospectId: { not: null } }],
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
        paymentUrl: null,
        paymentToken: null,
        note: appendNote({
          existingNote: fee.note,
          note: "Voided: Removed from captain squad payment collection",
        }),
      },
    });
  }

  await syncTeamChargeForZeroFeeWaivers({ teamId, fixtureId });
  await ensurePlayerMatchFeePaymentDetailsForFees(createdOrUpdatedFeeIds);
  const delivery = await emailPlayerPaymentLinks(createdOrUpdatedFeeIds);

  revalidatePath(getPlayerPaymentsPath(teamId, fixtureId));
  redirect(
    getPlayerPaymentsPath(
      teamId,
      fixtureId,
      `&saved=collection_created&emailsQueued=${delivery.queued}&emailsSkipped=${delivery.skipped}`,
    ),
  );
}
