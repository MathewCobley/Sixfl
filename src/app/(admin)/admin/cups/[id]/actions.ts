"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

async function assertCupSeason(leagueId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT l."id"
    FROM "League" l
    INNER JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
    WHERE l."id" = ${leagueId}
      AND c."competitionType" = 'CUP'
    LIMIT 1
  `);

  if (!rows[0]) throw new Error("Cup competition not found.");
}

export async function addCupEntrantAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!leagueId || !teamId) throw new Error("Choose a team to enter into the cup.");
  await assertCupSeason(leagueId);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) throw new Error("Selected team was not found.");

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "LeagueSeasonTeam" (
      "id",
      "leagueId",
      "teamId",
      "divisionId",
      "isActive",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${`cupentry_${randomUUID()}`},
      ${leagueId},
      ${teamId},
      NULL,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT ("leagueId", "teamId") DO UPDATE
    SET "isActive" = true,
        "divisionId" = NULL,
        "updatedAt" = NOW()
  `);

  revalidatePath("/admin/cups");
  revalidatePath(`/admin/cups/${leagueId}`);
}

export async function removeCupEntrantAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!leagueId || !teamId) throw new Error("Cup and team are required.");
  await assertCupSeason(leagueId);

  const fixtureRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Fixture"
    WHERE "leagueId" = ${leagueId}
      AND ("homeTeamId" = ${teamId} OR "awayTeamId" = ${teamId})
    LIMIT 1
  `);

  if (fixtureRows[0]) {
    throw new Error(
      "This team already has a cup fixture. Replace or remove its cup fixtures before withdrawing it from the competition.",
    );
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "LeagueSeasonTeam"
    SET "isActive" = false,
        "updatedAt" = NOW()
    WHERE "leagueId" = ${leagueId}
      AND "teamId" = ${teamId}
  `);

  revalidatePath("/admin/cups");
  revalidatePath(`/admin/cups/${leagueId}`);
}
