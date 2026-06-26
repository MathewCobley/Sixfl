// ========================================
// File: src/app/(admin)/admin/referee-nights/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toLondonDateInputValue } from "@/lib/datetime/london";
import {
  createRefereeNightId,
  findFixturesForNight,
  parseMoneyToPence,
  recalculateRefereeNightCashup,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

  if (fixtures.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const fixture of fixtures) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeNightFixture" ("id", "refereeNightId", "fixtureId")
        VALUES (${createRefereeNightId()}, ${input.refereeNightId}, ${fixture.id})
        ON CONFLICT ("fixtureId") DO UPDATE
        SET "refereeNightId" = EXCLUDED."refereeNightId"
      `);
    }

    await tx.fixture.updateMany({
      where: {
        id: {
          in: fixtures.map((fixture) => fixture.id),
        },
      },
      data: {
        refereeId: input.refereeId,
      },
    });
  });

  return fixtures.length;
}

export async function createRefereeNightAction(formData: FormData) {
  const { user } = await requireAdmin();

  const refereeId = readRequired(formData, "refereeId", "Referee");
  const leagueId = readRequired(formData, "leagueId", "League");
  const venueId = normaliseOptional(readString(formData, "venueId"));
  const nightDate = readRequired(formData, "nightDate", "Night date");
  const feePence = parseMoneyToPence(formData.get("feePounds")) ?? 0;
  const adminNotes = normaliseOptional(readString(formData, "adminNotes"));
  const id = createRefereeNightId();

  const referee = await prisma.user.findFirst({
    where: {
      id: refereeId,
      role: {
        in: ["REFEREE", "ADMIN"],
      },
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

  await attachMatchingFixtures({
    refereeNightId: id,
    refereeId,
    leagueId,
    venueId,
    nightDate,
  });

  await recalculateRefereeNightCashup(id);

  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/referee-nights/${id}`);
  revalidatePath("/referee");

  redirect(`/admin/referee-nights/${id}?created=1`);
}

export async function refreshRefereeNightFixturesAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const nightRows = await prisma.$queryRaw<
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

  const night = nightRows[0];
  if (!night) throw new Error("Referee night not found.");

  const nightDate = toLondonDateInputValue(new Date(String(night.nightDate)));

  await attachMatchingFixtures({
    refereeNightId,
    refereeId: night.refereeId,
    leagueId: night.leagueId,
    venueId: night.venueId,
    nightDate,
  });

  await recalculateRefereeNightCashup(refereeNightId);

  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/referee");

  redirect(`/admin/referee-nights/${refereeNightId}?fixtures=refreshed`);
}

export async function updateRefereeNightAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const feePence = parseMoneyToPence(formData.get("feePounds")) ?? 0;
  const adminNotes = normaliseOptional(readString(formData, "adminNotes"));

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "feePence" = ${feePence},
      "adminNotes" = ${adminNotes},
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  await recalculateRefereeNightCashup(refereeNightId);

  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/referee");

  redirect(`/admin/referee-nights/${refereeNightId}?saved=1`);
}

async function setRefereeNightStatus(input: {
  formData: FormData;
  status: RefereeNightStatus;
}) {
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

  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/referee");

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
