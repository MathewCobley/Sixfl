import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { TeamMoveConfirmationStatus } from "@/lib/teams/move-confirmation";

const RESPONSE_LINK_LIFETIME_MS = 1000 * 60 * 60 * 24 * 60;

export class TeamMoveResponseError extends Error {}

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new TeamMoveResponseError("Team move response links are not configured.");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret())
    .update(`sixfl-team-move-response-v1:${payload}`)
    .digest();
}

export function createTeamMoveResponseToken(input: {
  teamId: string;
  leagueId: string;
  expiresAt?: Date;
}) {
  const expires = (input.expiresAt ?? new Date(Date.now() + RESPONSE_LINK_LIFETIME_MS)).getTime();
  const payload = Buffer.from(
    JSON.stringify({ teamId: input.teamId, leagueId: input.leagueId, expires }),
  ).toString("base64url");

  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readTeamMoveResponseToken(token: string, now = Date.now()) {
  try {
    if (!token || token.length > 2048) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error();
    const [payload, signature] = parts;

    const actual = Buffer.from(signature, "base64url");
    const expected = sign(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      teamId?: unknown;
      leagueId?: unknown;
      expires?: unknown;
    };

    if (
      typeof parsed.teamId !== "string" ||
      typeof parsed.leagueId !== "string" ||
      typeof parsed.expires !== "number" ||
      !Number.isFinite(parsed.expires) ||
      parsed.expires <= now
    ) {
      throw new Error();
    }

    return {
      teamId: parsed.teamId,
      leagueId: parsed.leagueId,
      expires: parsed.expires,
    };
  } catch {
    throw new TeamMoveResponseError(
      "This move confirmation link is invalid or has expired. Please contact SIXFL.",
    );
  }
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

export function getTeamMoveResponseUrls(input: { teamId: string; leagueId: string }) {
  const token = createTeamMoveResponseToken(input);
  const base = `${getSiteUrl()}/team-move/${encodeURIComponent(token)}`;
  return {
    token,
    yesUrl: `${base}?answer=YES`,
    noUrl: `${base}?answer=NO`,
  };
}

export async function getTeamMoveResponseContext(token: string) {
  const capability = readTeamMoveResponseToken(token);
  const team = await prisma.team.findUnique({
    where: { id: capability.teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      moveConfirmationStatus: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          isMoving: true,
        },
      },
    },
  });

  if (!team || !team.league || team.leagueId !== capability.leagueId) {
    throw new TeamMoveResponseError(
      "This move confirmation link is no longer valid for this team. Please contact SIXFL.",
    );
  }

  if (!team.league.isMoving) {
    throw new TeamMoveResponseError("This league move confirmation is no longer open.");
  }

  return {
    token,
    team: {
      id: team.id,
      name: team.name,
      status: team.moveConfirmationStatus as TeamMoveConfirmationStatus,
    },
    league: {
      id: team.league.id,
      name: team.league.name,
      season: team.league.season,
    },
  };
}

export async function saveTeamMoveResponse(input: {
  token: string;
  response: "CONFIRMED" | "DECLINED";
}) {
  const context = await getTeamMoveResponseContext(input.token);
  const status: TeamMoveConfirmationStatus = input.response;
  const updatedAt = new Date();

  const updated = await prisma.team.updateMany({
    where: {
      id: context.team.id,
      leagueId: context.league.id,
      league: { is: { isMoving: true } },
    },
    data: {
      moveConfirmationStatus: status,
      moveConfirmationUpdatedAt: updatedAt,
      moveConfirmationUpdatedBy: "Team email response",
    },
  });

  if (updated.count !== 1) {
    throw new TeamMoveResponseError(
      "We could not save this response because the team details changed. Please contact SIXFL.",
    );
  }

  return {
    ...context,
    status,
    updatedAt,
  };
}
