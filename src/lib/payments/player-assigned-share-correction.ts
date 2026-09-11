import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { money } from "./player-ledger";

export class PlayerAssignedShareCorrectionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const fail = (message: string, status = 400): never => {
  throw new PlayerAssignedShareCorrectionError(message, status);
};

const CAP_NOTE_PATTERN = /(Player fee cap applied: captain share £)([0-9,.]+)(; player charged £)([0-9,.]+)(\.)/i;

type Db = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "$executeRaw"
  | "user"
  | "playerMatchFee"
  | "playerFeeLedgerState"
  | "playerLedgerEntry"
>;

type ProfileRow = {
  override: number | null;
  cap: number | null;
};

type AssignedRow = {
  assigned: number | null;
};

function parsePoundsToPence(value: string | undefined) {
  if (!value) return null;
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function formatPoundsForNote(pence: number) {
  return (pence / 100).toFixed(2);
}

async function assertAdmin(actorUserId: string, db: Db) {
  const actor = actorUserId
    ? await db.user.findUnique({
        where: { id: actorUserId },
        select: { id: true, role: true },
      })
    : null;

  if (!actor || actor.role !== "ADMIN") {
    fail("Administrator access is required.", 403);
  }
}

async function loadCandidate(feeId: string, actorUserId: string, db: Db) {
  await assertAdmin(actorUserId, db);

  const fee = await db.playerMatchFee.findUnique({
    where: { id: feeId },
    include: {
      team: { select: { name: true } },
      fixture: {
        select: {
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      teamMember: {
        select: { user: { select: { name: true, email: true } } },
      },
      prospect: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!fee) return null;

  const assignedRows = await db.$queryRaw<AssignedRow[]>(Prisma.sql`
    SELECT "captainAssignedAmountPence" AS assigned
    FROM "PlayerMatchFee"
    WHERE id=${feeId}
  `);
  const currentAssignedPence =
    assignedRows[0]?.assigned !== null && assignedRows[0]?.assigned !== undefined
      ? Number(assignedRows[0].assigned)
      : fee.amountPence;

  let profile: ProfileRow | null = null;
  if (fee.teamMemberId) {
    const profiles = await db.$queryRaw<ProfileRow[]>(Prisma.sql`
      SELECT
        (to_jsonb(p)->>'playerMatchFeePenceOverride')::integer AS override,
        (to_jsonb(p)->>'playerMatchFeeCapPence')::integer AS cap
      FROM "TeamMemberProfile" p
      WHERE "teamMemberId"=${fee.teamMemberId}
      LIMIT 1
    `);
    profile = profiles[0] ?? null;
  }

  const capNote = CAP_NOTE_PATTERN.exec(fee.note ?? "");
  const noteAssignedPence = parsePoundsToPence(capNote?.[2]);
  const hasFeeCapEvidence = Boolean(capNote);
  const hasCurrentConcession =
    profile?.cap !== null && profile?.cap !== undefined ||
    profile?.override !== null && profile?.override !== undefined;

  if (!hasFeeCapEvidence && !hasCurrentConcession) return null;

  const playerName = fee.teamMember?.user.name?.trim()
    || fee.teamMember?.user.email?.trim()
    || [fee.prospect?.firstName, fee.prospect?.lastName].filter(Boolean).join(" ").trim()
    || fee.prospect?.email?.trim()
    || "Player";

  return {
    fee,
    feeId,
    teamId: fee.teamId,
    teamName: fee.team.name,
    playerName,
    fixtureLabel: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`,
    kickoffAt: fee.fixture.kickoffAt.toISOString(),
    playerChargePence: fee.amountPence,
    currentAssignedPence,
    suggestedAssignedPence:
      noteAssignedPence !== null && noteAssignedPence >= fee.amountPence
        ? noteAssignedPence
        : currentAssignedPence,
    capPence: profile?.cap ?? null,
    overridePence: profile?.override ?? null,
    hasFeeCapEvidence,
  };
}

export async function getCaptainAssignedShareCorrectionCandidate(
  feeId: string,
  actorUserId: string,
) {
  const candidate = await loadCandidate(feeId, actorUserId, prisma);
  if (!candidate) return null;

  const { fee: _fee, ...publicCandidate } = candidate;
  return publicCandidate;
}

export async function correctCaptainAssignedShare(input: {
  feeId: string;
  actorUserId: string;
  assignedPence: number;
  expectedAssignedPence: number;
  confirmed: boolean;
}) {
  if (!input.confirmed) {
    fail("Confirm that this is only a captain-share correction before saving.");
  }
  if (!Number.isSafeInteger(input.assignedPence) || input.assignedPence < 0 || input.assignedPence > 500000) {
    fail("Enter a valid captain-assigned share of no more than £5,000.");
  }
  if (!Number.isSafeInteger(input.expectedAssignedPence) || input.expectedAssignedPence < 0) {
    fail("The current assigned share could not be verified. Reload the page.");
  }

  return prisma.$transaction(async (db) => {
    await assertAdmin(input.actorUserId, db);
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM "PlayerMatchFee" WHERE id=${input.feeId} FOR UPDATE
    `);

    const candidate = await loadCandidate(input.feeId, input.actorUserId, db);
    if (!candidate) {
      fail("This player fee no longer has a cap or override. Nothing was changed.");
    }
    if (candidate.currentAssignedPence !== input.expectedAssignedPence) {
      fail("The captain-assigned share changed after this page was opened. Reload before correcting it.");
    }
    if (input.assignedPence < candidate.playerChargePence) {
      fail(
        `The captain-assigned share cannot be lower than the player's recorded charge of ${money(candidate.playerChargePence)}.`,
      );
    }

    if (input.assignedPence === candidate.currentAssignedPence) {
      return {
        teamId: candidate.teamId,
        feeId: candidate.feeId,
        previousAssignedPence: candidate.currentAssignedPence,
        assignedPence: input.assignedPence,
        playerChargePence: candidate.playerChargePence,
        unchanged: true,
      };
    }

    const previousStatus = candidate.fee.status;
    const previousAmountPence = candidate.fee.amountPence;
    const previousNote = candidate.fee.note ?? null;
    const nextNote = previousNote?.replace(
      CAP_NOTE_PATTERN,
      (_match, prefix: string, _oldShare: string, middle: string, charged: string, suffix: string) =>
        `${prefix}${formatPoundsForNote(input.assignedPence)}${middle}${charged}${suffix}`,
    ) ?? null;

    await db.$executeRaw(Prisma.sql`
      UPDATE "PlayerMatchFee"
      SET "captainAssignedAmountPence"=${input.assignedPence},
          "note"=${nextNote},
          "updatedAt"=NOW()
      WHERE id=${input.feeId}
    `);

    const after = await db.playerMatchFee.findUnique({
      where: { id: input.feeId },
      select: { amountPence: true, status: true },
    });
    const assignedAfter = await db.$queryRaw<AssignedRow[]>(Prisma.sql`
      SELECT "captainAssignedAmountPence" AS assigned
      FROM "PlayerMatchFee"
      WHERE id=${input.feeId}
    `);

    if (
      !after ||
      after.amountPence !== previousAmountPence ||
      after.status !== previousStatus ||
      Number(assignedAfter[0]?.assigned) !== input.assignedPence
    ) {
      throw new Error("Captain-share correction changed an unexpected payment field; transaction rolled back.");
    }

    const state = await db.playerFeeLedgerState.findUnique({
      where: { feeId: input.feeId },
      select: { balancePence: true },
    });

    if (state) {
      await db.playerLedgerEntry.create({
        data: {
          feeId: input.feeId,
          teamId: candidate.teamId,
          kind: "CAPTAIN_SHARE_CORRECTION",
          amountPence: 0,
          balanceAfterPence: state.balancePence,
          receiptPence: 0,
          actorUserId: input.actorUserId,
          reason: `SIXFL corrected the captain-assigned share from ${money(candidate.currentAssignedPence)} to ${money(input.assignedPence)}. The player's charge, payments and outstanding balance were not changed.`,
          sourceKey: `captain-share-correction:${input.feeId}:${randomUUID()}`,
        },
      });
    }

    return {
      teamId: candidate.teamId,
      feeId: candidate.feeId,
      previousAssignedPence: candidate.currentAssignedPence,
      assignedPence: input.assignedPence,
      playerChargePence: candidate.playerChargePence,
      unchanged: false,
    };
  }, { maxWait: 5000, timeout: 15000 });
}
