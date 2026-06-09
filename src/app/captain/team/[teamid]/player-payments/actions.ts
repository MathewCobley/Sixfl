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

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
}

function isLockedPlayerFee(status: PlayerMatchFeeStatus) {
  return status === "PAID";
}

function getCollectionNote(amountPence: number) {
  if (amountPence === 0) return "Captain collection: waived / £0.00";
  return `Captain collection: £${(amountPence / 100).toFixed(2)} for this player`;
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
  const createdOrUpdatedFeeIds: string[] = [];

  for (const player of players) {
    const playerAmountPence = getPlayerAmountPence({
      formData,
      type: player.type,
      id: player.id,
      defaultAmountPence,
    });

    if (playerAmountPence === null) {
      redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=invalid_player_amount"));
    }

    const nextStatus: PlayerMatchFeeStatus = playerAmountPence === 0 ? "WAIVED" : "OPEN";
    const now = new Date();
    const note = getCollectionNote(playerAmountPence);

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

      if (existing && isLockedPlayerFee(existing.status)) {
        continue;
      }

      if (existing) {
        const fee = await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence: playerAmountPence,
            teamId,
            status: nextStatus,
            paidAt: null,
            waivedAt: nextStatus === "WAIVED" ? now : null,
            cancelledAt: null,
            paymentUrl: nextStatus === "WAIVED" ? null : undefined,
            paymentToken: nextStatus === "WAIVED" ? null : undefined,
            note: appendNote({ existingNote: existing.note, note }),
          },
          select: { id: true, status: true },
        });

        if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
      } else {
        const fee = await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            teamMemberId: player.id,
            amountPence: playerAmountPence,
            status: nextStatus,
            waivedAt: nextStatus === "WAIVED" ? now : null,
            note,
          },
          select: { id: true, status: true },
        });

        if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
      }
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

      if (existing && isLockedPlayerFee(existing.status)) {
        continue;
      }

      if (existing) {
        const fee = await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence: playerAmountPence,
            teamId,
            status: nextStatus,
            paidAt: null,
            waivedAt: nextStatus === "WAIVED" ? now : null,
            cancelledAt: null,
            paymentUrl: nextStatus === "WAIVED" ? null : undefined,
            paymentToken: nextStatus === "WAIVED" ? null : undefined,
            note: appendNote({ existingNote: existing.note, note }),
          },
          select: { id: true, status: true },
        });

        if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
      } else {
        const fee = await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            prospectId: player.id,
            amountPence: playerAmountPence,
            status: nextStatus,
            waivedAt: nextStatus === "WAIVED" ? now : null,
            note,
          },
          select: { id: true, status: true },
        });

        if (fee.status === "OPEN") createdOrUpdatedFeeIds.push(fee.id);
      }
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

  await ensurePlayerMatchFeePaymentDetailsForFees(createdOrUpdatedFeeIds);
  await emailPlayerPaymentLinks(createdOrUpdatedFeeIds);

  revalidatePath(getPlayerPaymentsPath(teamId, fixtureId));
  redirect(getPlayerPaymentsPath(teamId, fixtureId, "&saved=collection_created"));
}
