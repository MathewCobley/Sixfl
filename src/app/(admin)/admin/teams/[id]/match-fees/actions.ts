// ========================================
// File: src/app/(admin)/admin/teams/[id]/match-fees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PlayerMatchFeeStatus } from "@prisma/client";

import {
  buildPlayerNameSnapshot,
  setPlayerMatchFeeSnapshot,
} from "@/lib/payments/player-match-fee-snapshots";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

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
    .filter((value) =>
      (value.type === "member" || value.type === "prospect") && Boolean(value.id),
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

async function assertFixtureBelongsToTeam(input: {
  fixtureId: string;
  teamId: string;
}) {
  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: {
      id: true,
    },
  });

  return Boolean(fixture);
}

function getMatchFeesPath(teamId: string, fixtureId?: string, suffix = "") {
  const query = fixtureId ? `?fixtureId=${encodeURIComponent(fixtureId)}${suffix}` : suffix;
  return `/admin/teams/${teamId}/match-fees${query}`;
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

export async function createPlayerMatchFeesAction(formData: FormData) {
  await requireAdmin();

  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const amountPence = parseAmountPence(getString(formData, "amount"));
  const note = getString(formData, "note") || null;
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

  const selectedMemberIds = players.filter((player) => player.type === "member").map((player) => player.id);
  const profileByMemberId = await getTeamMemberProfilesByTeamMemberIds(selectedMemberIds);

  for (const player of players) {
    if (player.type === "member") {
      const member = await prisma.teamMember.findFirst({
        where: {
          id: player.id,
          teamId,
        },
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      });

      if (!member) continue;

      const snapshot = {
        name: buildPlayerNameSnapshot({ name: member.user.name, email: member.user.email }),
        email: member.user.email,
        phone: profileByMemberId.get(player.id)?.phone ?? null,
      };

      const existing = await prisma.playerMatchFee.findFirst({
        where: {
          fixtureId,
          teamMemberId: player.id,
        },
        select: { id: true },
      });

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data: {
              amountPence,
              teamId,
              note,
              status: "OPEN",
              cancelledAt: null,
              waivedAt: null,
            },
            select: { id: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              teamId,
              teamMemberId: player.id,
              amountPence,
              note,
            },
            select: { id: true },
          });

      await setPlayerMatchFeeSnapshot({ feeId: fee.id, snapshot });
    }

    if (player.type === "prospect") {
      const prospect = await prisma.teamPlayerProspect.findFirst({
        where: {
          id: player.id,
          teamId,
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });

      if (!prospect) continue;

      const snapshot = {
        name: buildPlayerNameSnapshot({
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          email: prospect.email,
          phone: prospect.phone,
        }),
        email: prospect.email,
        phone: prospect.phone,
      };

      const existing = await prisma.playerMatchFee.findFirst({
        where: {
          fixtureId,
          prospectId: player.id,
        },
        select: { id: true },
      });

      const fee = existing
        ? await prisma.playerMatchFee.update({
            where: { id: existing.id },
            data: {
              amountPence,
              teamId,
              note,
              status: "OPEN",
              cancelledAt: null,
              waivedAt: null,
            },
            select: { id: true },
          })
        : await prisma.playerMatchFee.create({
            data: {
              fixtureId,
              teamId,
              prospectId: player.id,
              amountPence,
              note,
            },
            select: { id: true },
          });

      await setPlayerMatchFeeSnapshot({ feeId: fee.id, snapshot });
    }
  }

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fees_created"));
}

export async function updatePlayerMatchFeeStatusAction(formData: FormData) {
  await requireAdmin();

  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");
  const status = getString(formData, "status") as PlayerMatchFeeStatus;

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

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=fee_updated"));
}

export async function markPlayerMatchFeePaidAction(formData: FormData) {
  await requireAdmin();

  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");
  const method = getString(formData, "method");

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
    where: {
      id: existingFee.id,
    },
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
