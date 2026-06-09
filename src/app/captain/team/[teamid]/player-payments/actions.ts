// ========================================
// File: src/app/captain/team/[teamid]/player-payments/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
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

function parseAmountPence(value: string) {
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric) || numeric <= 0) return null;

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

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
}

function isClosedPlayerFee(status: PlayerMatchFeeStatus) {
  return status === "PAID" || status === "WAIVED";
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

export async function createCaptainSquadPaymentCollectionAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const amountPence = parseAmountPence(getString(formData, "amount"));
  const players = getSelectedPlayers(formData);

  if (!teamId || !fixtureId) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  await requireCaptain(teamId);

  if (!amountPence) {
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
  const baseNote = `Captain collection: £${(amountPence / 100).toFixed(2)} per player`;

  for (const player of players) {
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

      if (existing && isClosedPlayerFee(existing.status)) {
        createdOrUpdatedFeeIds.push(existing.id);
        continue;
      }

      if (existing) {
        const fee = await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence,
            teamId,
            status: "OPEN",
            paidAt: null,
            waivedAt: null,
            cancelledAt: null,
            note: appendNote({ existingNote: existing.note, note: baseNote }),
          },
          select: { id: true },
        });
        createdOrUpdatedFeeIds.push(fee.id);
      } else {
        const fee = await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            teamMemberId: player.id,
            amountPence,
            note: baseNote,
          },
          select: { id: true },
        });
        createdOrUpdatedFeeIds.push(fee.id);
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

      if (existing && isClosedPlayerFee(existing.status)) {
        createdOrUpdatedFeeIds.push(existing.id);
        continue;
      }

      if (existing) {
        const fee = await prisma.playerMatchFee.update({
          where: { id: existing.id },
          data: {
            amountPence,
            teamId,
            status: "OPEN",
            paidAt: null,
            waivedAt: null,
            cancelledAt: null,
            note: appendNote({ existingNote: existing.note, note: baseNote }),
          },
          select: { id: true },
        });
        createdOrUpdatedFeeIds.push(fee.id);
      } else {
        const fee = await prisma.playerMatchFee.create({
          data: {
            fixtureId,
            teamId,
            prospectId: player.id,
            amountPence,
            note: baseNote,
          },
          select: { id: true },
        });
        createdOrUpdatedFeeIds.push(fee.id);
      }
    }
  }

  const removableFees = await prisma.playerMatchFee.findMany({
    where: {
      teamId,
      fixtureId,
      status: { in: ["OPEN", "CANCELLED"] },
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

  revalidatePath(getPlayerPaymentsPath(teamId, fixtureId));
  redirect(getPlayerPaymentsPath(teamId, fixtureId, "&saved=collection_created"));
}
