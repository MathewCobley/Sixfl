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

/**
 * SIXFL extends Prisma at runtime, so the generated PrismaClient and the
 * transaction callback client are not structurally assignable even though the
 * delegates used here have the same runtime contract. Keep the adapter local
 * to this correction service rather than weakening the application's client.
 */
type Db = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "$executeRaw"
  | "user"
  | "playerMatchFee"
  | "playerFeeLedgerState"
  | "playerLedgerEntry"
>;

const correctionDb = (db: unknown) => db as Db;

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

function capNote(assignedPence: number, chargedPence: number) {
  return `Player fee cap applied: captain share £${formatPoundsForNote(assignedPence)}; player charged £${formatPoundsForNote(chargedPence)}.`;
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

  const capMatch = CAP_NOTE_PATTERN.exec(fee.note ?? "");
  const noteAssignedPence = parsePoundsToPence(capMatch?.[2]);
  const hasFeeCapEvidence = Boolean(capMatch);
  const hasCurrentConcession =
    (profile?.cap !== null && profile?.cap !== undefined) ||
    (profile?.override !== null && profile?.override !== undefined);

  if (!hasFeeCapEvidence && !hasCurrentConcession) return null;

  const playerName =
    fee.teamMember?.user.name?.trim() ||
    fee.teamMember?.user.email?.trim() ||
    [fee.prospect?.firstName, fee.prospect?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    fee.prospect?.email?.trim() ||
    "Player";

  const currentCapMatchesCharge =
    profile?.cap !== null &&
    profile?.cap !== undefined &&
    profile.cap === fee.amountPence &&
    currentAssignedPence > fee.amountPence;

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
    canApplyCurrentCapToFixture: !hasFeeCapEvidence && currentCapMatchesCharge,
  };
}

export async function getCaptainAssignedShareCorrectionCandidate(
  feeId: string,
  actorUserId: string,
) {
  const candidate = await loadCandidate(
    feeId,
    actorUserId,
    correctionDb(prisma),
  );
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
  if (
    !Number.isSafeInteger(input.assignedPence) ||
    input.assignedPence < 0 ||
    input.assignedPence > 500000
  ) {
    fail("Enter a valid captain-assigned share of no more than £5,000.");
  }
  if (
    !Number.isSafeInteger(input.expectedAssignedPence) ||
    input.expectedAssignedPence < 0
  ) {
    fail("The current assigned share could not be verified. Reload the page.");
  }

  return prisma.$transaction(
    async (transaction) => {
      const db = correctionDb(transaction);
      await assertAdmin(input.actorUserId, db);
      await db.$queryRaw(Prisma.sql`
        SELECT id FROM "PlayerMatchFee" WHERE id=${input.feeId} FOR UPDATE
      `);

      const candidate = await loadCandidate(
        input.feeId,
        input.actorUserId,
        db,
      );
      if (!candidate) {
        throw new PlayerAssignedShareCorrectionError(
          "This player fee no longer has a cap or override. Nothing was changed.",
        );
      }
      if (candidate.currentAssignedPence !== input.expectedAssignedPence) {
        fail(
          "The captain-assigned share changed after this page was opened. Reload before correcting it.",
        );
      }
      if (input.assignedPence < candidate.playerChargePence) {
        fail(
          `The captain-assigned share cannot be lower than the player's recorded charge of ${money(candidate.playerChargePence)}.`,
        );
      }

      const applyCurrentCap =
        candidate.canApplyCurrentCapToFixture &&
        input.assignedPence === candidate.currentAssignedPence;

      if (input.assignedPence === candidate.currentAssignedPence && !applyCurrentCap) {
        return {
          teamId: candidate.teamId,
          feeId: candidate.feeId,
          previousAssignedPence: candidate.currentAssignedPence,
          assignedPence: input.assignedPence,
          playerChargePence: candidate.playerChargePence,
          unchanged: true,
          adjustmentRecorded: candidate.hasFeeCapEvidence,
        };
      }

      const previousStatus = candidate.fee.status;
      const previousAmountPence = candidate.fee.amountPence;
      const previousNote = candidate.fee.note ?? null;
      const nextCapNote = capNote(input.assignedPence, candidate.playerChargePence);
      const nextNote = candidate.hasFeeCapEvidence
        ? previousNote?.replace(CAP_NOTE_PATTERN, nextCapNote) ?? nextCapNote
        : candidate.canApplyCurrentCapToFixture
          ? [previousNote?.trim(), nextCapNote].filter(Boolean).join("\n")
          : previousNote;

      await db.$executeRaw(Prisma.sql`
        UPDATE "PlayerMatchFee"
        SET "captainAssignedAmountPence"=${input.assignedPence},
            "note"=${nextNote},
            "updatedAt"=NOW()
        WHERE id=${input.feeId}
      `);

      const after = await db.playerMatchFee.findUnique({
        where: { id: input.feeId },
        select: { amountPence: true, status: true, note: true },
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
        Number(assignedAfter[0]?.assigned) !== input.assignedPence ||
        ((applyCurrentCap || candidate.hasFeeCapEvidence) && !after.note?.includes(nextCapNote))
      ) {
        throw new Error(
          "Captain-share correction changed an unexpected payment field; transaction rolled back.",
        );
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
            reason: applyCurrentCap
              ? `SIXFL applied the player's existing ${money(candidate.playerChargePence)} cap to this historical fixture. Captain share ${money(input.assignedPence)}, player charge ${money(candidate.playerChargePence)}, difference ${money(input.assignedPence - candidate.playerChargePence)} recorded as the fixture adjustment. Payment status, receipts and outstanding balance were unchanged.`
              : `SIXFL corrected the captain-assigned share from ${money(candidate.currentAssignedPence)} to ${money(input.assignedPence)}. The player's charge, payments and outstanding balance were not changed.`,
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
        adjustmentRecorded: applyCurrentCap || candidate.hasFeeCapEvidence,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
