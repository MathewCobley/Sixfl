"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const CUP_FORMATS = new Set(["KNOCKOUT", "GROUPS_THEN_KNOCKOUT"]);
const LEAGUE_TYPES = new Set(["MENS", "WOMENS", "YOUTH"]);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export async function createCupAction(formData: FormData) {
  await requireAdmin();

  const name = requiredText(formData, "name", "Cup name");
  const season = requiredText(formData, "season", "Season");
  const requestedFormat = String(formData.get("cupFormat") ?? "KNOCKOUT").trim();
  const requestedLeagueType = String(formData.get("leagueType") ?? "MENS").trim();
  const isInterLeague = String(formData.get("isInterLeague") ?? "") === "on";

  if (name.length > 160) throw new Error("Cup name must be 160 characters or fewer.");
  if (season.length > 80) throw new Error("Season must be 80 characters or fewer.");
  if (!CUP_FORMATS.has(requestedFormat)) throw new Error("Choose a valid cup format.");
  if (!LEAGUE_TYPES.has(requestedLeagueType)) throw new Error("Choose a valid competition type.");

  const competitionSlug = slugify(name);
  const seasonSlug = slugify(`${name}-${season}`);

  if (!competitionSlug || !seasonSlug) {
    throw new Error("The cup name and season must contain letters or numbers.");
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "LeagueCompetition"
    WHERE "slug" = ${competitionSlug}
    LIMIT 1
  `);

  if (existing[0]) {
    throw new Error("A competition with that cup name already exists.");
  }

  const existingSeason = await prisma.league.findFirst({
    where: {
      OR: [
        { slug: seasonSlug },
        { name, season },
      ],
    },
    select: { id: true },
  });

  if (existingSeason) {
    throw new Error("A league or cup season with that name already exists.");
  }

  const competitionId = `cup_${randomUUID()}`;
  const leagueId = `cupseason_${randomUUID()}`;
  const formatLabel =
    requestedFormat === "GROUPS_THEN_KNOCKOUT"
      ? "Cup — groups then knockout"
      : "Cup — knockout";

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeagueCompetition" (
        "id",
        "name",
        "slug",
        "leagueType",
        "isActive",
        "competitionType",
        "cupFormat",
        "isInterLeague",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${competitionId},
        ${name},
        ${competitionSlug},
        ${requestedLeagueType}::"LeagueType",
        true,
        'CUP',
        ${requestedFormat},
        ${isInterLeague},
        NOW(),
        NOW()
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "League" (
        "id",
        "name",
        "season",
        "isActive",
        "slug",
        "leagueType",
        "format",
        "description",
        "competitionId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${leagueId},
        ${name},
        ${season},
        true,
        ${seasonSlug},
        ${requestedLeagueType}::"LeagueType",
        ${formatLabel},
        ${isInterLeague
          ? "Inter-league SIXFL cup competition. Teams keep their normal league membership and are entered separately into this cup."
          : "SIXFL cup competition. Teams keep their normal league membership and are entered separately into this cup."},
        ${competitionId},
        NOW(),
        NOW()
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "LeagueCompetition"
      SET "currentLeagueId" = ${leagueId},
          "updatedAt" = NOW()
      WHERE "id" = ${competitionId}
    `);
  });

  revalidatePath("/admin/cups");
  revalidatePath("/admin/leagues");
  redirect(`/admin/cups/${encodeURIComponent(leagueId)}`);
}
