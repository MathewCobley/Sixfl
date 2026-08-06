import Link from "next/link";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { ensureTemporaryPlayerPassTable } from "@/lib/temporary-player-passes";

type PendingRequest = {
  id: string;
  fixtureId: string;
  displayName: string;
  createdAt: Date;
  expiresAt: Date;
  kickoffAt: Date;
  teamName: string;
  opponentName: string;
};

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CaptainTemporaryPlayerRequestSummary({
  teamId,
}: {
  teamId: string;
}) {
  await ensureTemporaryPlayerPassTable();

  await prisma.$executeRaw`
    UPDATE "TemporaryPlayerPass"
    SET "status" = 'EXPIRED', "updatedAt" = NOW()
    WHERE "teamId" = ${teamId}
      AND "status" = 'OPEN'
      AND "expiresAt" <= NOW()
  `;

  const requests = await prisma.$queryRaw<PendingRequest[]>(Prisma.sql`
    SELECT
      pass."id",
      pass."fixtureId",
      CASE
        WHEN TRIM(COALESCE(player."name", '')) = '' THEN 'SIXFL player'
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'), 1) > 1
          THEN SPLIT_PART(TRIM(player."name"), ' ', 1) || ' ' ||
            UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(player."name"), '\\s+'))[2], 1)) || '.'
        ELSE SPLIT_PART(TRIM(player."name"), ' ', 1)
      END AS "displayName",
      pass."createdAt",
      pass."expiresAt",
      fixture."kickoffAt",
      selected_team."name" AS "teamName",
      CASE
        WHEN fixture."homeTeamId" = pass."teamId" THEN away_team."name"
        ELSE home_team."name"
      END AS "opponentName"
    FROM "TemporaryPlayerPass" pass
    INNER JOIN "User" player ON player."id" = pass."userId"
    INNER JOIN "Fixture" fixture ON fixture."id" = pass."fixtureId"
    INNER JOIN "Team" selected_team ON selected_team."id" = pass."teamId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE pass."teamId" = ${teamId}
      AND pass."status" = 'OPEN'
      AND pass."expiresAt" > NOW()
    ORDER BY pass."createdAt" ASC
    LIMIT 5
  `);

  if (requests.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-400/25 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.13),transparent_42%),rgba(255,255,255,0.035)] shadow-[0_18px_65px_rgba(0,0,0,0.22)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/75">
              Temporary player request{requests.length === 1 ? "" : "s"}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {requests.length === 1
                ? "A player is waiting for your response"
                : `${requests.length} players are waiting for your response`}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">
              The player selected your team and this fixture themselves. Review the request and choose Accept or Decline. Accepting links them to that fixture and creates their £6 match fee.
            </p>
          </div>
          <span className="w-fit rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-100">
            {requests.length} waiting
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {requests.map((request) => {
            const pastMatch = request.kickoffAt <= new Date();
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{request.displayName}</div>
                    <div className="mt-1 text-sm text-white/70">
                      {pastMatch ? "Claims they played for" : "Wants to play for"}{" "}
                      <span className="font-semibold text-white">{request.teamName}</span>
                      {" · vs "}
                      {request.opponentName}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatFixtureDate(request.kickoffAt)}
                    </div>
                  </div>
                  <Link
                    href={`/captain/team/${teamId}/match-fees?fixtureId=${encodeURIComponent(request.fixtureId)}`}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-sky-200"
                  >
                    Review request
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
