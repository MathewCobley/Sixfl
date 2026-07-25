"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { markTeamAsFixturePlaceholder } from "@/lib/teams/fixture-placeholders";
import { createTeamAction } from "../actions";

export async function createTeamWithPlaceholderAction(formData: FormData) {
  const isFixturePlaceholder =
    String(formData.get("isFixturePlaceholder") ?? "") === "on";

  if (!isFixturePlaceholder) {
    await createTeamAction(formData);
    return;
  }

  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim() || "TBC";
  const leagueId = String(formData.get("leagueId") ?? "").trim();

  if (!leagueId) {
    redirect("/admin/teams/new?error=placeholder_requires_league");
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true },
  });

  if (!league) {
    redirect("/admin/teams/new?error=placeholder_requires_league");
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT t."id"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${leagueId}
      AND lst."isActive" = true
      AND t."isFixturePlaceholder" = true
    LIMIT 1
  `;

  if (existing[0]) {
    redirect("/admin/teams/new?error=placeholder_exists");
  }

  await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name,
        claimCode: `TBC-${randomUUID().slice(0, 8).toUpperCase()}`,
        leagueId: null,
        logoUrl: null,
        latestKickoffTime: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        secondaryContactName: null,
        secondaryContactEmail: null,
        secondaryContactPhone: null,
      },
      select: { id: true },
    });

    await markTeamAsFixturePlaceholder({
      teamId: team.id,
      leagueId,
      client: tx,
    });
  });

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath("/admin/fixtures");

  redirect("/admin/teams?placeholderCreated=1");
}
