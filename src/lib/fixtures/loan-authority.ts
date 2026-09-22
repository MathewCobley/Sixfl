import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LoanAuthorityError, parseLoanAuthority } from "./loan-authority-policy";

export type LoanAuthorityRequest = { fixtureId: string; teamId: string; count: number; revision: number };

// A request records a team's intent; named guest eligibility remains in guest-approvals.
export async function getLoanAuthorityRequests(fixtureIds: string[]) {
  if (!fixtureIds.length) return [];
  return prisma.$queryRaw<LoanAuthorityRequest[]>(Prisma.sql`
    SELECT r."fixtureId", r."teamId", r."count", r."revision"
    FROM "FixtureLoanAuthorityRequest" r JOIN "Fixture" f ON f."id" = r."fixtureId"
    WHERE r."fixtureId" IN (${Prisma.join(fixtureIds)})
      AND r."teamId" IN (f."homeTeamId", f."awayTeamId")
  `);
}

export async function saveLoanAuthorityRequest(value: unknown, actorId: string) {
  const input = parseLoanAuthority(value);
  return prisma.$transaction(async (tx) => {
    const fixtures = await tx.$queryRaw<{ homeTeamId: string; awayTeamId: string }[]>(Prisma.sql`
      SELECT "homeTeamId", "awayTeamId" FROM "Fixture" WHERE "id" = ${input.fixtureId} FOR UPDATE
    `);
    const fixture = fixtures[0];
    if (!fixture || ![fixture.homeTeamId, fixture.awayTeamId].includes(input.teamId)) {
      throw new LoanAuthorityError("This team is no longer in this fixture. Reload the Night Board.", 409);
    }
    const previous = await tx.$queryRaw<LoanAuthorityRequest[]>(Prisma.sql`
      SELECT "fixtureId", "teamId", "count", "revision" FROM "FixtureLoanAuthorityRequest"
      WHERE "fixtureId" = ${input.fixtureId} AND "teamId" = ${input.teamId}
    `);
    if ((previous[0]?.revision ?? 0) !== input.revision) {
      throw new LoanAuthorityError("Someone changed this request. Reload before saving again.", 409);
    }
    const rows = await tx.$queryRaw<LoanAuthorityRequest[]>(Prisma.sql`
      INSERT INTO "FixtureLoanAuthorityRequest" ("fixtureId", "teamId", "count", "revision", "updatedBy", "updatedAt")
      VALUES (${input.fixtureId}, ${input.teamId}, ${input.count}, 1, ${actorId}, NOW())
      ON CONFLICT ("fixtureId", "teamId") DO UPDATE
      SET "count" = EXCLUDED."count", "revision" = "FixtureLoanAuthorityRequest"."revision" + 1,
          "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()
      RETURNING "fixtureId", "teamId", "count", "revision"
    `);
    return rows[0];
  });
}
