import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OptimisedBadgeImage } from "@/lib/images/upload";

export class TeamBadgeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "TeamBadgeError";
  }
}

/** Team.logoUrl remains the shared source of truth for every badge consumer. */
export async function saveTeamBadge(input: {
  teamId: string;
  expectedLogoUrl: string;
  createdByUserId: string | null;
  image: OptimisedBadgeImage | null;
}): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; logoUrl: string | null }>>(Prisma.sql`
      SELECT "id", "logoUrl" FROM "Team" WHERE "id" = ${input.teamId} FOR UPDATE
    `);
    const team = rows[0];
    if (!team) throw new TeamBadgeError("This team could not be found.", 404);
    if ((team.logoUrl ?? "") !== input.expectedLogoUrl) {
      throw new TeamBadgeError("This badge was changed in another session. Refresh the page before saving again.", 409);
    }

    let logoUrl: string | null = null;
    if (input.image) {
      const id = randomUUID();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TeamBadgeImage" ("id", "teamId", "createdByUserId", "imageData", "thumbnailData")
        VALUES (${id}, ${input.teamId}, ${input.createdByUserId}, ${input.image.imageData}, ${input.image.thumbnailData})
      `);
      // Existing server-side social/PDF renderers fetch absolute URLs, but read
      // relative paths from public/. Keep uploaded badges compatible with both.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://www.sixfl.co.uk";
      logoUrl = new URL(`/api/team-badges/${id}`, siteUrl).toString();
    }
    // Retain old immutable images so previously shared image URLs do not break.
    // Removing a badge unlinks it from the team; deleting the team cascades its images.
    await tx.team.update({ where: { id: input.teamId }, data: { logoUrl } });
    return logoUrl;
  });
}

export async function getTeamBadgeImage(id: string, thumbnail: boolean) {
  const column = thumbnail ? Prisma.sql`"thumbnailData"` : Prisma.sql`"imageData"`;
  const rows = await prisma.$queryRaw<Array<{ data: Uint8Array }>>(Prisma.sql`
    SELECT ${column} AS "data" FROM "TeamBadgeImage" WHERE "id" = ${id} LIMIT 1
  `);
  return rows[0]?.data ?? null;
}
