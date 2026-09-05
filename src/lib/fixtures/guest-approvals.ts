import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GuestApprovalError, parseGuestDecision, type GuestDecisionInput } from "./guest-approval-policy";

type FixtureRow = {
  id: string; homeTeamId: string; awayTeamId: string; kickoffAt: Date;
  publishedAt: Date | null; status: string;
};
export type GuestApprovalRow = {
  id: string; playerUserId: string; playerName: string; status: "APPROVED" | "REVOKED";
  revision: number; approvedAt: Date; approvedByName: string; reason: string;
  revokedAt: Date | null; revokedByName: string | null; revocationReason: string | null;
};
export type GuestCandidate = { id: string; name: string; email: string | null; teams: string };

function assertTeamFixture(fixture: FixtureRow | undefined, teamId: string): asserts fixture is FixtureRow {
  if (!fixture || !fixture.publishedAt || ![fixture.homeTeamId, fixture.awayTeamId].includes(teamId)) {
    throw new GuestApprovalError("That published fixture does not belong to this team.", 404);
  }
}

/** Reads only. Approval is not attendance, a second registration, a fee or a waiver. */
export async function getFixtureGuestApprovals(teamId: string, fixtureId: string, db: PrismaClient = prisma) {
  const fixtures = await db.$queryRaw<FixtureRow[]>(Prisma.sql`
    SELECT "id", "homeTeamId", "awayTeamId", "kickoffAt", "publishedAt", "status"::text
    FROM "Fixture" WHERE "id" = ${fixtureId}
  `);
  const fixture = fixtures[0];
  assertTeamFixture(fixture, teamId);
  const teams = await db.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name" FROM "Team" WHERE "id" IN (${fixture.homeTeamId}, ${fixture.awayTeamId})
  `);
  const approvals = await db.$queryRaw<GuestApprovalRow[]>(Prisma.sql`
    SELECT a."id", a."playerUserId", COALESCE(NULLIF(TRIM(u."name"), ''), 'Unnamed player') AS "playerName",
      a."status", a."revision", a."approvedAt", a."approvedByName", a."reason",
      a."revokedAt", a."revokedByName", a."revocationReason"
    FROM "FixtureGuestApproval" a JOIN "User" u ON u."id" = a."playerUserId"
    WHERE a."fixtureId" = ${fixtureId} AND a."teamId" = ${teamId}
    ORDER BY a."approvedAt" DESC, a."id"
  `);
  return {
    fixture: {
      id: fixture.id, kickoffAt: fixture.kickoffAt.toISOString(), status: fixture.status,
      teamName: teams.find((t) => t.id === teamId)?.name ?? "Team",
      opponentName: teams.find((t) => t.id !== teamId)?.name ?? "Opponent",
      editable: fixture.status === "SCHEDULED" && fixture.kickoffAt.getTime() > Date.now(),
    },
    approvals,
  };
}

/** Called only after full admin access has been checked by the API. */
export async function searchGuestCandidates(teamId: string, query: string, db: PrismaClient = prisma) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [] as GuestCandidate[];
  if (trimmed.length > 80) throw new GuestApprovalError("Search using no more than 80 characters.");
  const term = `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;
  return db.$queryRaw<GuestCandidate[]>(Prisma.sql`
    SELECT u."id", COALESCE(NULLIF(TRIM(u."name"), ''), 'Unnamed player') AS "name", u."email",
      COALESCE((SELECT STRING_AGG(t."name", ', ' ORDER BY t."name") FROM "TeamMember" m
        JOIN "Team" t ON t."id" = m."teamId" WHERE m."userId" = u."id"), 'No permanent team') AS "teams"
    FROM "User" u
    WHERE (u."name" ILIKE ${term} OR u."email" ILIKE ${term})
      AND NOT EXISTS (SELECT 1 FROM "TeamMember" own WHERE own."userId" = u."id" AND own."teamId" = ${teamId})
    ORDER BY u."name" NULLS LAST, u."id" LIMIT 20
  `);
}

/** Revalidate at write time and lock the fixture: two admin tabs cannot silently overwrite one another. */
export async function setFixtureGuestApproval(
  input: GuestDecisionInput & { teamId: string; actorUserId: string }, db: PrismaClient = prisma,
) {
  const decision = parseGuestDecision(input);
  if (!input.teamId || !input.actorUserId) throw new GuestApprovalError("SIXFL admin access is required.", 403);
  return db.$transaction(async (tx) => {
    const actors = await tx.$queryRaw<Array<{ name: string | null; role: string }>>(Prisma.sql`
      SELECT "name", "role"::text FROM "User" WHERE "id" = ${input.actorUserId} FOR SHARE
    `);
    if (actors[0]?.role !== "ADMIN") throw new GuestApprovalError("SIXFL admin access is required.", 403);
    const actorName = actors[0].name?.trim() || "SIXFL administrator";
    const fixtures = await tx.$queryRaw<FixtureRow[]>(Prisma.sql`
      SELECT "id", "homeTeamId", "awayTeamId", "kickoffAt", "publishedAt", "status"::text
      FROM "Fixture" WHERE "id" = ${decision.fixtureId} FOR UPDATE
    `);
    const fixture = fixtures[0];
    assertTeamFixture(fixture, input.teamId);
    const now = new Date();
    if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= now) {
      throw new GuestApprovalError("Guest permissions can only be changed before kick-off for a scheduled fixture.", 409);
    }
    if (fixture.kickoffAt.getTime() !== Date.parse(decision.expectedKickoffAt)) {
      throw new GuestApprovalError("The fixture time has changed. Reload and check the match before approving.", 409);
    }
    const existing = await tx.$queryRaw<Array<{ id: string; status: string; revision: number }>>(Prisma.sql`
      SELECT "id", "status", "revision" FROM "FixtureGuestApproval"
      WHERE "fixtureId" = ${decision.fixtureId} AND "teamId" = ${input.teamId} AND "playerUserId" = ${decision.playerUserId}
    `);
    const previous = existing[0];
    if ((previous?.revision ?? null) !== decision.expectedRevision) {
      throw new GuestApprovalError("This approval was changed in another session. Reload before making a change.", 409);
    }
    const nextStatus = decision.decision === "approve" ? "APPROVED" : "REVOKED";
    if (decision.decision === "revoke" && !previous) throw new GuestApprovalError("That approval was not found.", 404);
    if (previous?.status === nextStatus) return { id: previous.id, status: nextStatus, changed: false };
    if (decision.decision === "approve") {
      const players = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "User" WHERE "id" = ${decision.playerUserId} FOR SHARE
      `);
      if (!players[0]) throw new GuestApprovalError("Choose an existing SIXFL player.", 404);
      const members = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "TeamMember" WHERE "userId" = ${decision.playerUserId} AND "teamId" = ${input.teamId} LIMIT 1
      `);
      if (members[0]) throw new GuestApprovalError("This player is already in this team's permanent squad. Guest approval is not needed.", 409);
      const otherSide = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "FixtureGuestApproval" WHERE "fixtureId" = ${decision.fixtureId}
          AND "playerUserId" = ${decision.playerUserId} AND "teamId" <> ${input.teamId} AND "status" = 'APPROVED'
      `);
      if (otherSide[0]) throw new GuestApprovalError("This player is already approved for the opposing team in this fixture.", 409);
    }
    const id = previous?.id ?? `fga_${randomUUID().replaceAll('-', '')}`;
    const revision = (previous?.revision ?? 0) + 1;
    if (!previous) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FixtureGuestApproval" ("id", "fixtureId", "teamId", "playerUserId", "status", "revision",
          "approvedAt", "approvedByUserId", "approvedByName", "reason")
        VALUES (${id}, ${decision.fixtureId}, ${input.teamId}, ${decision.playerUserId}, 'APPROVED', ${revision},
          ${now}, ${input.actorUserId}, ${actorName}, ${decision.reason})
      `);
    } else if (decision.decision === "approve") {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "FixtureGuestApproval" SET "status" = 'APPROVED', "revision" = ${revision}, "approvedAt" = ${now},
          "approvedByUserId" = ${input.actorUserId}, "approvedByName" = ${actorName}, "reason" = ${decision.reason},
          "revokedAt" = NULL, "revokedByUserId" = NULL, "revokedByName" = NULL, "revocationReason" = NULL
        WHERE "id" = ${id}
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "FixtureGuestApproval" SET "status" = 'REVOKED', "revision" = ${revision}, "revokedAt" = ${now},
          "revokedByUserId" = ${input.actorUserId}, "revokedByName" = ${actorName}, "revocationReason" = ${decision.reason}
        WHERE "id" = ${id}
      `);
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FixtureGuestApprovalEvent" ("id", "approvalId", "decision", "revision", "actorUserId", "actorName", "reason", "createdAt")
      VALUES (${randomUUID()}, ${id}, ${nextStatus}, ${revision}, ${input.actorUserId}, ${actorName}, ${decision.reason}, ${now})
    `);
    return { id, status: nextStatus, changed: true };
  });
}
