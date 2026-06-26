// ========================================
// File: src/app/(public)/referee/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { FixtureStatus, Prisma, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReferee } from "@/lib/admin";
import {
  parseMoneyToPence,
  recalculateRefereeNightCashup,
} from "@/lib/referee-nights";

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

async function assertNightAccess(input: {
  refereeNightId: string;
  fixtureId?: string;
  user: { id: string; role: UserRole };
}) {
  const rows = await prisma.$queryRaw<Array<{ id: string; refereeId: string }>>(Prisma.sql`
    SELECT rn.id, rn."refereeId"
    FROM "RefereeNight" rn
    ${input.fixtureId
      ? Prisma.sql`JOIN "RefereeNightFixture" rnf ON rnf."refereeNightId" = rn.id AND rnf."fixtureId" = ${input.fixtureId}`
      : Prisma.empty}
    WHERE rn.id = ${input.refereeNightId}
    LIMIT 1
  `);

  const night = rows[0];
  if (!night) throw new Error("Referee night not found.");

  if (input.user.role !== UserRole.ADMIN && night.refereeId !== input.user.id) {
    throw new Error("You are not allowed to access this referee night.");
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
    ? "PAID"
    : paidPence > 0
      ? "PART_PAID"
      : "OPEN";

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
    throw new Error("Please enter a valid amount collected.");
  }

  await assertNightAccess({ refereeNightId, fixtureId, user });

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");
  if (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId) {
    throw new Error("Selected team is not part of this fixture.");
  }

  const teamName = fixture.homeTeamId === teamId ? fixture.homeTeam.name : fixture.awayTeam.name;

  const charge = await prisma.paymentCharge.upsert({
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
      amountPence,
      dueDate: fixture.kickoffAt,
      status: "OPEN",
    },
    select: {
      id: true,
      amountPence: true,
    },
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PaymentTransaction" (
      "id", "teamId", "chargeId", "amountPence", "method", "reference", "notes", "paidAt", "collectedByUserId", "refereeNightId", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${teamId}, ${charge.id}, ${amountPence}, ${method}::"PaymentMethod", 'Referee night cash', ${notes}, NOW(), ${user.id}, ${refereeNightId}, NOW(), NOW()
    )
  `);

  await updateChargeStatus(charge.id);
  await recalculateRefereeNightCashup(refereeNightId);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/payments");

  redirect(`/referee/night/${refereeNightId}?saved=cash`);
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
