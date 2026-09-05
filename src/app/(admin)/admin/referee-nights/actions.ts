// ========================================
// File: src/app/(admin)/admin/referee-nights/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toLondonDateInputValue } from "@/lib/datetime/london";
import { scheduleRefereeEveningForNight } from "@/lib/referees/evening-notifications";
import {
  createRefereeNightId,
  findFixturesForNight,
  parseMoneyToPence,
  recalculateRefereeNightCashup,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getRefereeProfileByUserId } from "@/lib/referees/profile";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readRequired(formData: FormData, key: string, label: string) {
  const value = readString(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function normaliseOptional(value: string) {
  return value.trim() || null;
}

function safeReturnTo(value: string) {
  return value.startsWith("/admin/referee-nights") ? value : "/admin/referee-nights";
}

function readStringArray(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

function revalidateRefereeNightPaths(refereeNightId?: string) {
  revalidatePath("/admin/referee-nights");
  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");
  revalidatePath("/referee");

  if (refereeNightId) {
    revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  }
}

async function getNightFeePence(formData: FormData, refereeId: string) {
  const enteredFee = parseMoneyToPence(formData.get("feePounds"));

  if (enteredFee !== null) {
    return enteredFee;
  }

  const profile = await getRefereeProfileByUserId(refereeId);
  return profile?.standardNightFeePence ?? 0;
}

async function getRefereeNightForAssignment(refereeNightId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      refereeId: string;
      leagueId: string;
      venueId: string | null;
      nightDate: Date | string;
    }>
  >(Prisma.sql`
    SELECT id, "refereeId", "leagueId", "venueId", "nightDate"
    FROM "RefereeNight"
    WHERE id = ${refereeNightId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function getAllowedFixtureIdsForNight(input: {
  leagueId: string;
  venueId: string | null;
  nightDate: Date | string;
}) {
  const nightDate = toLondonDateInputValue(new Date(String(input.nightDate)));
  const fixtures = await findFixturesForNight({
    leagueId: input.leagueId,
    venueId: input.venueId,
    nightDate,
  });

  return fixtures.map((fixture) => fixture.id);
}

async function getCurrentFixtureIds(refereeNightId: string) {
  const rows = await prisma.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`
    SELECT "fixtureId"
    FROM "RefereeNightFixture"
    WHERE "refereeNightId" = ${refereeNightId}
  `);

  return rows.map((row) => row.fixtureId);
}

async function getExistingAssignments(fixtureIds: string[]) {
  if (fixtureIds.length === 0) {
    return [] as Array<{ fixtureId: string; refereeNightId: string }>;
  }

  return prisma.$queryRaw<Array<{ fixtureId: string; refereeNightId: string }>>(Prisma.sql`
    SELECT "fixtureId", "refereeNightId"
    FROM "RefereeNightFixture"
    WHERE "fixtureId" IN (${Prisma.join(fixtureIds)})
  `);
}

async function attachMatchingFixtures(input: {
  refereeNightId: string;
  refereeId: string;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
}) {
  const fixtures = await findFixturesForNight({
    leagueId: input.leagueId,
    venueId: input.venueId,
    nightDate: input.nightDate,
  });

  if (fixtures.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const fixture of fixtures) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeNightFixture" ("id", "refereeNightId", "fixtureId")
        VALUES (${createRefereeNightId()}, ${input.refereeNightId}, ${fixture.id})
        ON CONFLICT ("fixtureId") DO NOTHING
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "Fixture" f
      SET "refereeId" = ${input.refereeId}
      FROM "RefereeNightFixture" rnf
      WHERE rnf."fixtureId" = f.id
        AND rnf."refereeNightId" = ${input.refereeNightId}
    `);
  });

  return fixtures.length;
}

export async function createRefereeNightAction(formData: FormData) {
  const { user } = await requireAdmin();

  const refereeId = readRequired(formData, "refereeId", "Referee");
  const leagueId = readRequired(formData, "leagueId", "League");
  const venueId = normaliseOptional(readString(formData, "venueId"));
  const nightDate = readRequired(formData, "nightDate", "Night date");
  const feePence = await getNightFeePence(formData, refereeId);
  const adminNotes = normaliseOptional(readString(formData, "adminNotes"));
  const id = createRefereeNightId();

  const referee = await prisma.user.findFirst({
    where: {
      id: refereeId,
      role: { in: ["REFEREE", "ADMIN"] },
    },
    select: { id: true },
  });

  if (!referee) throw new Error("Selected referee was not found.");

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "RefereeNight" (
      "id", "refereeId", "leagueId", "venueId", "nightDate", "feePence", "status", "adminNotes", "createdByUserId", "updatedAt"
    ) VALUES (
      ${id}, ${refereeId}, ${leagueId}, ${venueId}, ${nightDate}::date, ${feePence}, 'DRAFT', ${adminNotes}, ${user?.id ?? null}, NOW()
    )
  `);

  const attachedCount = await attachMatchingFixtures({
    refereeNightId: id,
    refereeId,
    leagueId,
    venueId,
    nightDate,
  });

  await recalculateRefereeNightCashup(id);

  try {
    await scheduleRefereeEveningForNight({ refereeNightId: id, createdByUserId: user?.id ?? null });
  } catch (error) {
    console.warn("Could not queue referee booking email", error);
  }

  revalidateRefereeNightPaths(id);
  redirect(`/admin/referee-nights/${id}?created=1&fixtures=${attachedCount}`);
}

export async function chaseRefereeNightConfirmationAction(formData: FormData) {
  const { user } = await requireAdmin();
  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const returnTo = safeReturnTo(readString(formData, "returnTo"));

  await scheduleRefereeEveningForNight({
    refereeNightId,
    createdByUserId: user?.id ?? null,
  });

  revalidateRefereeNightPaths(refereeNightId);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}chased=1`);
}

export async function refreshRefereeNightFixturesAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const night = await getRefereeNightForAssignment(refereeNightId);

  if (!night) throw new Error("Referee night not found.");

  const nightDate = toLondonDateInputValue(new Date(String(night.nightDate)));

  const attachedCount = await attachMatchingFixtures({
    refereeNightId,
    refereeId: night.refereeId,
    leagueId: night.leagueId,
    venueId: night.venueId,
    nightDate,
  });

  await recalculateRefereeNightCashup(refereeNightId);
  revalidateRefereeNightPaths(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?fixtures=refreshed&attached=${attachedCount}`);
}

export async function updateRefereeNightFixturesAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const night = await getRefereeNightForAssignment(refereeNightId);

  if (!night) throw new Error("Referee night not found.");

  const [allowedFixtureIds, currentFixtureIds] = await Promise.all([
    getAllowedFixtureIdsForNight({ leagueId: night.leagueId, venueId: night.venueId, nightDate: night.nightDate }),
    getCurrentFixtureIds(refereeNightId),
  ]);

  const allowedSet = new Set(allowedFixtureIds);
  const selectedFixtureIds = readStringArray(formData, "fixtureIds").filter((fixtureId) => allowedSet.has(fixtureId));
  const selectedSet = new Set(selectedFixtureIds);
  const removedFixtureIds = currentFixtureIds.filter((fixtureId) => !selectedSet.has(fixtureId));
  const existingSelectedAssignments = await getExistingAssignments(selectedFixtureIds);
  const affectedNightIds = new Set<string>([refereeNightId]);

  for (const assignment of existingSelectedAssignments) affectedNightIds.add(assignment.refereeNightId);

  await prisma.$transaction(async (tx) => {
    if (removedFixtureIds.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "RefereeNightFixture"
        WHERE "refereeNightId" = ${refereeNightId}
          AND "fixtureId" IN (${Prisma.join(removedFixtureIds)})
      `);

      await tx.fixture.updateMany({ where: { id: { in: removedFixtureIds }, refereeId: night.refereeId }, data: { refereeId: null } });
    }

    for (const fixtureId of selectedFixtureIds) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeNightFixture" ("id", "refereeNightId", "fixtureId")
        VALUES (${createRefereeNightId()}, ${refereeNightId}, ${fixtureId})
        ON CONFLICT ("fixtureId") DO UPDATE
        SET "refereeNightId" = EXCLUDED."refereeNightId"
      `);
    }

    if (selectedFixtureIds.length > 0) {
      await tx.fixture.updateMany({ where: { id: { in: selectedFixtureIds } }, data: { refereeId: night.refereeId } });
    }
  });

  await Promise.all(Array.from(affectedNightIds).map((nightId) => recalculateRefereeNightCashup(nightId)));
  revalidateRefereeNightPaths(refereeNightId);

  const selectedQuery = selectedFixtureIds.length > 0
    ? `&selectedFixtures=${encodeURIComponent(selectedFixtureIds.join(","))}`
    : "";

  redirect(`/admin/referee-nights/${refereeNightId}?fixtures=saved${selectedQuery}`);
}

export async function updateRefereeNightAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const feePence = parseMoneyToPence(formData.get("feePounds")) ?? 0;
  const adminNotes = normaliseOptional(readString(formData, "adminNotes"));

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET "feePence" = ${feePence}, "adminNotes" = ${adminNotes}, "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  await recalculateRefereeNightCashup(refereeNightId);
  revalidateRefereeNightPaths(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?saved=1`);
}

export async function updateRefereeNightCashDistributionAction(formData: FormData) {
  const { user } = await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const cashPaidToRefereePence = parseMoneyToPence(formData.get("cashPaidToRefereePounds")) ?? 0;
  const cashReceivedFromRefereePence = parseMoneyToPence(formData.get("cashReceivedFromRefereePounds")) ?? 0;
  const cashDistributionNotes = normaliseOptional(readString(formData, "cashDistributionNotes"));
  const hasDistribution = cashPaidToRefereePence > 0 || cashReceivedFromRefereePence > 0 || Boolean(cashDistributionNotes);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "cashPaidToRefereePence" = ${cashPaidToRefereePence},
      "cashReceivedFromRefereePence" = ${cashReceivedFromRefereePence},
      "cashDistributionNotes" = ${cashDistributionNotes},
      "cashDistributedAt" = ${hasDistribution ? new Date() : null},
      "cashDistributedByUserId" = ${hasDistribution ? user?.id ?? null : null},
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  await recalculateRefereeNightCashup(refereeNightId);
  revalidateRefereeNightPaths(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?cash=distributed`);
}

async function setRefereeNightStatus(input: { formData: FormData; status: RefereeNightStatus }) {
  const { user } = await requireAdmin();
  const refereeNightId = readRequired(input.formData, "refereeNightId", "Referee night");

  const approvedAtSql = input.status === "APPROVED" ? Prisma.sql`, "approvedAt" = NOW(), "approvedByUserId" = ${user?.id ?? null}` : Prisma.empty;
  const settledAtSql = input.status === "SETTLED" ? Prisma.sql`, "settledAt" = NOW(), "settledByUserId" = ${user?.id ?? null}` : Prisma.empty;
  const reopenSql = input.status === "REOPENED" ? Prisma.sql`, "approvedAt" = NULL, "settledAt" = NULL, "approvedByUserId" = NULL, "settledByUserId" = NULL` : Prisma.empty;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET "status" = ${input.status}, "updatedAt" = NOW()
      ${approvedAtSql}
      ${settledAtSql}
      ${reopenSql}
    WHERE id = ${refereeNightId}
  `);

  await recalculateRefereeNightCashup(refereeNightId);
  revalidateRefereeNightPaths(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?status=${input.status.toLowerCase()}`);
}

export async function approveRefereeNightAction(formData: FormData) {
  await setRefereeNightStatus({ formData, status: "APPROVED" });
}

export async function settleRefereeNightAction(formData: FormData) {
  await setRefereeNightStatus({ formData, status: "SETTLED" });
}

export async function reopenRefereeNightAction(formData: FormData) {
  await setRefereeNightStatus({ formData, status: "REOPENED" });
}
