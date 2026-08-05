import { randomBytes, randomUUID } from "node:crypto";
import { FixtureStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PASS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASS_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type TemporaryPlayerPassStatus =
  | "OPEN"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED";

export type TemporaryPlayerPassChoice = {
  fixtureId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
  venueName: string | null;
  pitch: string | null;
};

export type TemporaryPlayerPassSummary = {
  id: string;
  code: string;
  status: TemporaryPlayerPassStatus;
  expiresAt: Date;
  createdAt: Date;
  fixtureId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
  venueName: string | null;
  pitch: string | null;
};

type PassRow = TemporaryPlayerPassSummary;

type RedeemRow = {
  id: string;
  userId: string;
  fixtureId: string;
  teamId: string;
  status: TemporaryPlayerPassStatus;
  expiresAt: Date;
};

export class TemporaryPlayerPassError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PASS"
      | "PASS_EXPIRED"
      | "PASS_USED"
      | "PASS_REVOKED"
      | "WRONG_FIXTURE"
      | "FIXTURE_NOT_FOUND"
      | "ALREADY_IN_SQUAD"
      | "ALREADY_ADDED",
    message: string,
  ) {
    super(message);
    this.name = "TemporaryPlayerPassError";
  }
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function generatePassCode() {
  const bytes = randomBytes(6);
  let value = "";

  for (const byte of bytes) {
    value += PASS_ALPHABET[byte % PASS_ALPHABET.length];
  }

  return `TP-${value}`;
}

export function normaliseTemporaryPlayerPassCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

export async function ensureTemporaryPlayerPassTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemporaryPlayerPass" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "code" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "acceptedAt" TIMESTAMP(3),
      "acceptedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "playerMatchFeeId" TEXT REFERENCES "PlayerMatchFee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TemporaryPlayerPass_status_check"
        CHECK ("status" IN ('OPEN', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_userId_createdAt_idx" ON "TemporaryPlayerPass"("userId", "createdAt" DESC)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_fixtureId_teamId_status_idx" ON "TemporaryPlayerPass"("fixtureId", "teamId", "status")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_expiresAt_status_idx" ON "TemporaryPlayerPass"("expiresAt", "status")`,
  );
}

async function expireOldPasses(userId?: string) {
  await ensureTemporaryPlayerPassTable();

  if (userId) {
    await prisma.$executeRaw`
      UPDATE "TemporaryPlayerPass"
      SET "status" = 'EXPIRED', "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "status" = 'OPEN'
        AND "expiresAt" <= NOW()
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "TemporaryPlayerPass"
    SET "status" = 'EXPIRED', "updatedAt" = NOW()
    WHERE "status" = 'OPEN'
      AND "expiresAt" <= NOW()
  `;
}

export async function getTemporaryPlayerPassChoices(userId: string) {
  const now = new Date();
  const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const [memberships, fixtures] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    }),
    prisma.fixture.findMany({
      where: {
        publishedAt: { not: null },
        status: FixtureStatus.SCHEDULED,
        kickoffAt: { gt: now, lte: end },
      },
      orderBy: { kickoffAt: "asc" },
      take: 200,
      select: {
        id: true,
        kickoffAt: true,
        pitch: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { name: true } },
      },
    }),
  ]);

  const ownTeamIds = new Set(memberships.map((membership) => membership.teamId));
  const choices: TemporaryPlayerPassChoice[] = [];

  for (const fixture of fixtures) {
    const teams = [
      { team: fixture.homeTeam, opponent: fixture.awayTeam },
      { team: fixture.awayTeam, opponent: fixture.homeTeam },
    ];

    for (const item of teams) {
      const lowerName = item.team.name.trim().toLowerCase();
      if (ownTeamIds.has(item.team.id) || lowerName === "tbc" || lowerName.startsWith("tbc ")) {
        continue;
      }

      choices.push({
        fixtureId: fixture.id,
        teamId: item.team.id,
        teamName: item.team.name,
        opponentName: item.opponent.name,
        kickoffAt: fixture.kickoffAt,
        venueName: fixture.venue?.name ?? null,
        pitch: fixture.pitch,
      });
    }
  }

  return choices;
}

export async function listTemporaryPlayerPasses(userId: string) {
  await expireOldPasses(userId);

  return prisma.$queryRaw<PassRow[]>(Prisma.sql`
    SELECT
      pass."id",
      pass."code",
      pass."status",
      pass."expiresAt",
      pass."createdAt",
      pass."fixtureId",
      pass."teamId",
      selected_team."name" AS "teamName",
      CASE
        WHEN fixture."homeTeamId" = pass."teamId" THEN away_team."name"
        ELSE home_team."name"
      END AS "opponentName",
      fixture."kickoffAt",
      venue."name" AS "venueName",
      fixture."pitch"
    FROM "TemporaryPlayerPass" pass
    INNER JOIN "Fixture" fixture ON fixture."id" = pass."fixtureId"
    INNER JOIN "Team" selected_team ON selected_team."id" = pass."teamId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "Venue" venue ON venue."id" = fixture."venueId"
    WHERE pass."userId" = ${userId}
    ORDER BY pass."createdAt" DESC
    LIMIT 20
  `);
}

export async function createTemporaryPlayerPass(input: {
  userId: string;
  fixtureId: string;
  teamId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: input.fixtureId,
      publishedAt: { not: null },
      status: FixtureStatus.SCHEDULED,
      kickoffAt: { gt: new Date() },
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true, kickoffAt: true },
  });

  if (!fixture) {
    throw new TemporaryPlayerPassError(
      "FIXTURE_NOT_FOUND",
      "That fixture is no longer available for a temporary-player pass.",
    );
  }

  const [permanentMember, existingFee] = await Promise.all([
    prisma.teamMember.findFirst({
      where: { teamId: input.teamId, userId: input.userId },
      select: { id: true },
    }),
    prisma.playerMatchFee.findFirst({
      where: {
        fixtureId: input.fixtureId,
        teamId: input.teamId,
        temporaryUserId: input.userId,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    }),
  ]);

  if (permanentMember) {
    throw new TemporaryPlayerPassError(
      "ALREADY_IN_SQUAD",
      "You are already a permanent member of that squad.",
    );
  }

  if (existingFee) {
    throw new TemporaryPlayerPassError(
      "ALREADY_ADDED",
      "You are already linked to that team for this fixture.",
    );
  }

  await prisma.$executeRaw`
    UPDATE "TemporaryPlayerPass"
    SET "status" = 'REVOKED', "updatedAt" = NOW()
    WHERE "userId" = ${input.userId}
      AND "fixtureId" = ${input.fixtureId}
      AND "teamId" = ${input.teamId}
      AND "status" = 'OPEN'
  `;

  const now = new Date();
  const expiresAt = new Date(
    Math.min(fixture.kickoffAt.getTime(), now.getTime() + PASS_LIFETIME_MS),
  );

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const id = createId("tpp");
    const code = generatePassCode();

    try {
      await prisma.$executeRaw`
        INSERT INTO "TemporaryPlayerPass" (
          "id", "userId", "fixtureId", "teamId", "code", "status",
          "expiresAt", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${input.userId}, ${input.fixtureId}, ${input.teamId}, ${code},
          'OPEN', ${expiresAt}, NOW(), NOW()
        )
      `;

      const passes = await listTemporaryPlayerPasses(input.userId);
      const created = passes.find((pass) => pass.id === id);
      if (!created) throw new Error("Temporary-player pass was created but could not be reloaded.");
      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("TemporaryPlayerPass_code_key") || message.includes("duplicate key")) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("A unique temporary-player pass could not be generated.");
}

export async function revokeTemporaryPlayerPass(input: {
  userId: string;
  passId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  const changed = await prisma.$executeRaw`
    UPDATE "TemporaryPlayerPass"
    SET "status" = 'REVOKED', "updatedAt" = NOW()
    WHERE "id" = ${input.passId}
      AND "userId" = ${input.userId}
      AND "status" = 'OPEN'
  `;

  return changed > 0;
}

export async function redeemTemporaryPlayerPass(input: {
  code: string;
  fixtureId: string;
  teamId: string;
  acceptedByUserId: string | null;
}) {
  await expireOldPasses();
  const code = normaliseTemporaryPlayerPassCode(input.code);

  if (!/^TP-[A-Z0-9]{6}$/.test(code)) {
    throw new TemporaryPlayerPassError("INVALID_PASS", "That temporary-player pass is not valid.");
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<RedeemRow[]>(Prisma.sql`
      SELECT
        "id", "userId", "fixtureId", "teamId", "status", "expiresAt"
      FROM "TemporaryPlayerPass"
      WHERE "code" = ${code}
      LIMIT 1
      FOR UPDATE
    `);
    const pass = rows[0];

    if (!pass) {
      throw new TemporaryPlayerPassError("INVALID_PASS", "That temporary-player pass was not found.");
    }
    if (pass.status === "ACCEPTED") {
      throw new TemporaryPlayerPassError("PASS_USED", "That pass has already been used.");
    }
    if (pass.status === "REVOKED") {
      throw new TemporaryPlayerPassError("PASS_REVOKED", "The player has cancelled that pass.");
    }
    if (pass.status === "EXPIRED" || pass.expiresAt <= new Date()) {
      await tx.$executeRaw`
        UPDATE "TemporaryPlayerPass"
        SET "status" = 'EXPIRED', "updatedAt" = NOW()
        WHERE "id" = ${pass.id}
      `;
      throw new TemporaryPlayerPassError("PASS_EXPIRED", "That pass has expired.");
    }
    if (pass.fixtureId !== input.fixtureId || pass.teamId !== input.teamId) {
      throw new TemporaryPlayerPassError(
        "WRONG_FIXTURE",
        "That pass was created for a different team or fixture.",
      );
    }

    const fixture = await tx.fixture.findFirst({
      where: {
        id: input.fixtureId,
        publishedAt: { not: null },
        status: FixtureStatus.SCHEDULED,
        kickoffAt: { gt: new Date() },
        OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
      },
      select: { id: true },
    });

    if (!fixture) {
      throw new TemporaryPlayerPassError(
        "FIXTURE_NOT_FOUND",
        "That fixture is no longer available.",
      );
    }

    const permanentMember = await tx.teamMember.findFirst({
      where: { teamId: input.teamId, userId: pass.userId },
      select: { id: true },
    });
    if (permanentMember) {
      throw new TemporaryPlayerPassError(
        "ALREADY_IN_SQUAD",
        "That player is already in this team's squad.",
      );
    }

    const existingFee = await tx.playerMatchFee.findFirst({
      where: {
        fixtureId: input.fixtureId,
        teamId: input.teamId,
        temporaryUserId: pass.userId,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    if (existingFee) {
      throw new TemporaryPlayerPassError(
        "ALREADY_ADDED",
        "That player is already added to this fixture.",
      );
    }

    const playerMatchFeeId = createId("tmp");
    await tx.$executeRaw`
      INSERT INTO "PlayerMatchFee" (
        "id", "fixtureId", "teamId", "temporaryUserId", "amountPence",
        "status", "note", "createdAt", "updatedAt"
      ) VALUES (
        ${playerMatchFeeId}, ${input.fixtureId}, ${input.teamId}, ${pass.userId}, 600,
        'OPEN'::"PlayerMatchFeeStatus",
        'Temporary player joined using a player-created one-time pass',
        NOW(), NOW()
      )
    `;

    await tx.$executeRaw`
      UPDATE "TemporaryPlayerPass"
      SET
        "status" = 'ACCEPTED',
        "acceptedAt" = NOW(),
        "acceptedByUserId" = ${input.acceptedByUserId},
        "playerMatchFeeId" = ${playerMatchFeeId},
        "updatedAt" = NOW()
      WHERE "id" = ${pass.id}
    `;

    const player = await tx.user.findUnique({
      where: { id: pass.userId },
      select: { name: true, email: true },
    });
    const parts = (player?.name ?? "Player").trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || "Player";
    const surnameInitial = parts[1]?.charAt(0).toUpperCase() ?? "";

    return {
      playerMatchFeeId,
      userId: pass.userId,
      displayName: `${firstName}${surnameInitial ? ` ${surnameInitial}.` : ""}`,
      email: player?.email ?? null,
    };
  });
}
