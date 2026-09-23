// ========================================
// File: src/app/(public)/referee/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { FixtureStatus, PaymentChargeStatus, Prisma, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReferee } from "@/lib/admin";
import { resolveTeamFixtureFeePence } from "@/lib/payments/fixture-fee-policy";
import {
  getRefereeNightFixtureIds,
  parseMoneyToPence,
  recalculateRefereeNightCashup,
} from "@/lib/referee-nights";

const DISCIPLINARY_INCIDENT_TYPES = [
  "DISSENT",
  "FIGHTING",
  "AGGRESSIVE_CONDUCT",
  "OFFENSIVE_LANGUAGE",
  "THREATENING_BEHAVIOUR",
  "OTHER",
] as const;

const DISCIPLINARY_SEVERITIES = ["NOTE", "WARNING", "SERIOUS", "URGENT"] as const;

type DisciplinaryIncidentType = (typeof DISCIPLINARY_INCIDENT_TYPES)[number];
type DisciplinarySeverity = (typeof DISCIPLINARY_SEVERITIES)[number];

type OutstandingChargeForAllocation = {
  id: string;
  amountPence: number;
  fixtureId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  transactions: Array<{ amountPence: number }>;
};

type CashAllocation = {
  chargeId: string;
  amountPence: number;
  isCurrentFixtureCharge: boolean;
};

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (!str) throw new Error(`${fieldName} is required.`);
  return str;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseScore(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (str === "") throw new Error(`${fieldName} is required.`);

  const num = Number(str);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName} must be a whole number 0 or greater.`);
  }

  return num;
}

function parsePaymentMethod(value: FormDataEntryValue | null) {
  const method = String(value ?? "").trim();
  return ["CASH", "CARD", "BANK_TRANSFER", "OTHER"].includes(method)
    ? method
    : "CASH";
}

function parseDisciplinaryIncidentType(value: FormDataEntryValue | null): DisciplinaryIncidentType {
  const incidentType = String(value ?? "").trim().toUpperCase();
  return DISCIPLINARY_INCIDENT_TYPES.includes(incidentType as DisciplinaryIncidentType)
    ? (incidentType as DisciplinaryIncidentType)
    : "OTHER";
}

function parseDisciplinarySeverity(value: FormDataEntryValue | null): DisciplinarySeverity {
  const severity = String(value ?? "").trim().toUpperCase();
  return DISCIPLINARY_SEVERITIES.includes(severity as DisciplinarySeverity)
    ? (severity as DisciplinarySeverity)
    : "NOTE";
}

function getChargePaidTotal(transactions: Array<{ amountPence: number }>) {
  return transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0);
}

function getChargeOutstandingPence(charge: OutstandingChargeForAllocation) {
  return Math.max(0, charge.amountPence - getChargePaidTotal(charge.transactions));
}

function redirectCashEntryError(
  refereeNightId: string,
  code: "invalid_amount" | "too_high",
  options?: {
    maxCashPence?: number;
    existingNightCashPence?: number;
  },
): never {
  const params = new URLSearchParams({ cashError: code });
  if (
    typeof options?.maxCashPence === "number" &&
    Number.isFinite(options.maxCashPence)
  ) {
    params.set(
      "cashMaxPence",
      String(Math.max(0, Math.round(options.maxCashPence))),
    );
  }
  if (
    typeof options?.existingNightCashPence === "number" &&
    Number.isFinite(options.existingNightCashPence)
  ) {
    params.set(
      "cashExistingPence",
      String(Math.max(0, Math.round(options.existingNightCashPence))),
    );
  }
  redirect(`/referee/night/${refereeNightId}?${params.toString()}`);
}

function buildCashAllocationNote(input: {
  notes: string | null;
  homeTeamName: string;
  awayTeamName: string;
  isCurrentFixtureCharge: boolean;
}) {
  const allocationNote = input.isCurrentFixtureCharge
    ? null
    : `Allocated to oldest outstanding team charge from cash collected at ${input.homeTeamName} vs ${input.awayTeamName}.`;

  return [input.notes, allocationNote].filter(Boolean).join(" ") || null;
}

async function assertNightAccess(input: {
  refereeNightId: string;
  fixtureId?: string;
  user: { id: string; role: UserRole };
}) {
  const rows = await prisma.$queryRaw<Array<{ id: string; refereeId: string }>>(Prisma.sql`
    SELECT rn.id, rn."refereeId"
    FROM "RefereeNight" rn
    WHERE rn.id = ${input.refereeNightId}
    LIMIT 1
  `);

  const night = rows[0];
  if (!night) throw new Error("Referee night not found.");

  if (input.user.role !== UserRole.ADMIN && night.refereeId !== input.user.id) {
    throw new Error("You are not allowed to access this referee night.");
  }

  if (input.fixtureId) {
    const visibleFixtureIds = await getRefereeNightFixtureIds(input.refereeNightId);
    if (!visibleFixtureIds.includes(input.fixtureId)) {
      throw new Error("Fixture is not part of this referee night.");
    }
  }

  return night;
}

async function updateChargeStatus(chargeId: string) {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    select: { id: true, amountPence: true },
  });

  if (!charge) return;

  const total = await prisma.paymentTransaction.aggregate({
    where: { chargeId },
    _sum: { amountPence: true },
  });

  const paidPence = total._sum.amountPence ?? 0;
  const status = paidPence >= charge.amountPence
    ? PaymentChargeStatus.PAID
    : paidPence > 0
      ? PaymentChargeStatus.PART_PAID
      : PaymentChargeStatus.OPEN;

  await prisma.paymentCharge.update({
    where: { id: chargeId },
    data: { status },
  });
}

export async function submitRefereeResultAction(formData: FormData) {
  const { user } = await requireReferee();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const homeScore = parseScore(formData.get("homeScore"), "Home score");
  const awayScore = parseScore(formData.get("awayScore"), "Away score");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      refereeId: true,
      result: { select: { id: true } },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");

  const canEdit = fixture.refereeId === user.id || user.role === UserRole.ADMIN;
  if (!canEdit) throw new Error("You are not allowed to enter a result for this fixture.");

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
        isDisputed: false,
        disputeNote: null,
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
      },
    });

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: FixtureStatus.COMPLETED },
    });
  });

  revalidatePath("/referee");
  revalidatePath(`/referee/fixture/${fixtureId}`);
  revalidatePath("/admin/fixtures");

  redirect("/referee");
}

export async function submitNightFixtureResultAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const homeScore = parseScore(formData.get("homeScore"), "Home score");
  const awayScore = parseScore(formData.get("awayScore"), "Away score");

  await assertNightAccess({ refereeNightId, fixtureId, user });

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
        isDisputed: false,
        disputeNote: null,
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
      },
    });

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: FixtureStatus.COMPLETED },
    });
  });

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/fixtures");

  redirect(`/referee/night/${refereeNightId}?saved=result`);
}

export async function recordRefereeNightCashAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");
  const amountPence = parseMoneyToPence(formData.get("amountPounds"));
  const method = parsePaymentMethod(formData.get("method"));
  const notes = parseOptionalString(formData.get("notes"));

  if (!amountPence || amountPence <= 0) {
    redirectCashEntryError(refereeNightId, "invalid_amount");
  }

  await assertNightAccess({ refereeNightId, fixtureId, user });

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      matchFeePence: true,
      homeMatchFeePence: true,
      awayMatchFeePence: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true, standardMatchFeePence: true } },
      awayTeam: { select: { name: true, standardMatchFeePence: true } },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");
  if (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId) {
    throw new Error("Selected team is not part of this fixture.");
  }

  const teamIsHome = fixture.homeTeamId === teamId;
  const teamName = teamIsHome ? fixture.homeTeam.name : fixture.awayTeam.name;
  const fixtureFeePence = resolveTeamFixtureFeePence(
    teamIsHome ? fixture.homeMatchFeePence : fixture.awayMatchFeePence,
    teamIsHome
      ? fixture.homeTeam.standardMatchFeePence
      : fixture.awayTeam.standardMatchFeePence,
    fixture.matchFeePence,
  );

  const currentCharge = await prisma.paymentCharge.upsert({
    where: {
      fixtureId_teamId: {
        fixtureId,
        teamId,
      },
    },
    update: {},
    create: {
      teamId,
      leagueId: fixture.leagueId,
      fixtureId,
      title: `Match fee: ${teamName}`,
      description: "Created from referee night cash collection.",
      amountPence: fixtureFeePence,
      dueDate: fixture.kickoffAt,
      status: PaymentChargeStatus.OPEN,
    },
    select: {
      id: true,
      status: true,
    },
  });

  const openCharges = await prisma.paymentCharge.findMany({
    where: {
      teamId,
      status: {
        in: [PaymentChargeStatus.OPEN, PaymentChargeStatus.PART_PAID],
      },
    },
    select: {
      id: true,
      amountPence: true,
      fixtureId: true,
      dueDate: true,
      createdAt: true,
      transactions: {
        select: {
          amountPence: true,
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const totalOpenOutstandingPence = openCharges.reduce(
    (sum, charge) => sum + getChargeOutstandingPence(charge),
    0,
  );
  let remainingPence = amountPence;
  const allocations: CashAllocation[] = [];

  for (const charge of openCharges) {
    const outstandingPence = getChargeOutstandingPence(charge);
    if (outstandingPence <= 0) continue;

    const allocationAmountPence = Math.min(remainingPence, outstandingPence);
    if (allocationAmountPence <= 0) continue;

    allocations.push({
      chargeId: charge.id,
      amountPence: allocationAmountPence,
      isCurrentFixtureCharge: charge.id === currentCharge.id,
    });

    remainingPence -= allocationAmountPence;
    if (remainingPence <= 0) break;
  }

  if (remainingPence > 0 || allocations.length === 0) {
    const [existingNightCash] = await prisma.$queryRaw<
      Array<{ amountPence: bigint | number | null }>
    >(Prisma.sql`
      SELECT COALESCE(SUM("amountPence"), 0)::bigint AS "amountPence"
      FROM "PaymentTransaction"
      WHERE "refereeNightId" = ${refereeNightId}
        AND "teamId" = ${teamId}
    `);
    const existingNightCashPence = Number(existingNightCash?.amountPence ?? 0);

    redirectCashEntryError(refereeNightId, "too_high", {
      maxCashPence: totalOpenOutstandingPence,
      existingNightCashPence,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const allocation of allocations) {
      const allocationNotes = buildCashAllocationNote({
        notes,
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        isCurrentFixtureCharge: allocation.isCurrentFixtureCharge,
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PaymentTransaction" (
          "id", "teamId", "chargeId", "amountPence", "method", "reference", "notes", "paidAt", "collectedByUserId", "refereeNightId", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${teamId}, ${allocation.chargeId}, ${allocation.amountPence}, ${method}::"PaymentMethod", 'Referee night cash', ${allocationNotes}, NOW(), ${user.id}, ${refereeNightId}, NOW(), NOW()
        )
      `);
    }
  });

  await Promise.all(Array.from(new Set(allocations.map((allocation) => allocation.chargeId))).map(updateChargeStatus));
  await recalculateRefereeNightCashup(refereeNightId);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/payments");

  redirect(`/referee/night/${refereeNightId}?saved=cash`);
}

export async function recordFixtureDisciplinaryNoteAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");
  const incidentType = parseDisciplinaryIncidentType(formData.get("incidentType"));
  const severity = parseDisciplinarySeverity(formData.get("severity"));
  const description = parseRequiredString(formData.get("description"), "Disciplinary note");

  await assertNightAccess({ refereeNightId, fixtureId, user });

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (!fixture) throw new Error("Fixture not found.");
  if (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId) {
    throw new Error("Selected team is not part of this fixture.");
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "FixtureDisciplinaryNote" (
      "id", "fixtureId", "teamId", "refereeNightId", "reportedByUserId", "incidentType", "severity", "description", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${fixtureId}, ${teamId}, ${refereeNightId}, ${user.id}, ${incidentType}::"FixtureDisciplinaryIncidentType", ${severity}::"FixtureDisciplinarySeverity", ${description}, NOW(), NOW()
    )
  `);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/referee-nights");

  redirect(`/referee/night/${refereeNightId}?saved=discipline`);
}

export async function submitRefereeNightCashupAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const refereeNotes = parseOptionalString(formData.get("refereeNotes"));

  await assertNightAccess({ refereeNightId, user });
  await recalculateRefereeNightCashup(refereeNightId);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "status" = 'SUBMITTED',
      "refereeNotes" = ${refereeNotes},
      "submittedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/referee-nights");

  redirect(`/referee/night/${refereeNightId}?submitted=1`);
}
