import Link from "next/link";
import { Prisma } from "@prisma/client";

import { normalisePlayerIdentityName } from "@/lib/players/player-identity-safety";
import { prisma } from "@/lib/prisma";

type TeamRow = {
  id: string;
  name: string;
};

function uniqueTeams(rows: TeamRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export default async function PlayerPoolJoinedTeams({
  profileId,
  email,
  playerName,
}: {
  profileId: string;
  email: string | null;
  playerName: string;
}) {
  let teams = await prisma.$queryRaw<TeamRow[]>(Prisma.sql`
    SELECT DISTINCT team."id", team."name"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "Team" team ON team."id" = request."teamId"
    WHERE request."profileId" = ${profileId}
      AND request."status" = 'JOINED'
    ORDER BY team."name"
  `);

  if (teams.length === 0) {
    teams = await prisma.$queryRaw<TeamRow[]>(Prisma.sql`
      SELECT DISTINCT team."id", team."name"
      FROM "PlayerPoolProfile" pool
      JOIN "TeamMemberProfile" member_profile
        ON member_profile."sourceProspectId" = pool."prospectId"
      JOIN "TeamMember" member ON member."id" = member_profile."teamMemberId"
      JOIN "Team" team ON team."id" = member."teamId"
      WHERE pool."id" = ${profileId}
      ORDER BY team."name"
    `);
  }

  const cleanEmail = email?.trim().toLowerCase() || "";
  const nameKey = normalisePlayerIdentityName(playerName);

  if (teams.length === 0 && cleanEmail && nameKey) {
    teams = await prisma.$queryRaw<TeamRow[]>(Prisma.sql`
      SELECT DISTINCT team."id", team."name"
      FROM "User" player_user
      JOIN "TeamMember" member ON member."userId" = player_user."id"
      JOIN "Team" team ON team."id" = member."teamId"
      WHERE player_user."email" IS NOT NULL
        AND LOWER(TRIM(player_user."email")) = ${cleanEmail}
        AND LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[^[:alnum:]]+', ' ', 'g'),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = ${nameKey}
      ORDER BY team."name"
    `);
  }

  const resolvedTeams = uniqueTeams(teams);

  if (resolvedTeams.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-3 py-2 text-xs text-violet-100/65">
        Joined team not recorded on this PlayerPool route.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-xs">
      <span className="font-bold uppercase tracking-[0.12em] text-violet-200/70">
        {resolvedTeams.length === 1 ? "Joined team" : "Current squads"}
      </span>
      {resolvedTeams.map((team) => (
        <Link
          key={team.id}
          href={`/admin/teams/${team.id}`}
          className="rounded-full border border-violet-300/20 bg-black/20 px-2.5 py-1 font-bold text-white transition hover:bg-white/10"
        >
          {team.name}
        </Link>
      ))}
    </div>
  );
}
