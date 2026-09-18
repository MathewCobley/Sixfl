import Link from 'next/link';

import SixflTvPriorityScoreBadge from '@/components/sixfl-tv/SixflTvPriorityScoreBadge';
import { prisma } from '@/lib/prisma';
import { requireCaptain } from '@/lib/requireCaptain';
import { getSixflTvPriorityScore } from '@/lib/sixfl-tv/priority-score';

type ThisWeekVeoStatus = {
  hasMatchThisWeek: boolean;
  veoBooked: boolean;
};

async function readThisWeekVeoStatus(leagueId: string, teamId: string): Promise<ThisWeekVeoStatus> {
  const rows = await prisma.$queryRaw<{ fixtureId: string; veoBooked: boolean }[]>`
    SELECT
      f.id AS "fixtureId",
      EXISTS (
        SELECT 1
        FROM "VeoMatchBooking" booking
        WHERE booking."fixtureId" = f.id
          AND (booking.state IS NULL OR booking.state NOT IN ('FAILED', 'CANCELLED'))
      ) AS "veoBooked"
    FROM "Fixture" f
    WHERE f."leagueId" = ${leagueId}
      AND f."publishedAt" IS NOT NULL
      AND f.status::text = 'SCHEDULED'
      AND f."kickoffAt" >= NOW() AT TIME ZONE 'UTC'
      AND to_char(
        f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London',
        'IYYY-IW'
      ) = to_char(NOW() AT TIME ZONE 'Europe/London', 'IYYY-IW')
      AND ${teamId} IN (f."homeTeamId", f."awayTeamId")
    ORDER BY f."kickoffAt" ASC
    LIMIT 1
  `;

  const fixture = rows[0] ?? null;
  return {
    hasMatchThisWeek: Boolean(fixture),
    veoBooked: fixture?.veoBooked === true,
  };
}

const statusText = {
  ON_TIME: 'On time',
  LATE: 'Late',
  UNPAID: 'Unpaid',
  NOT_REQUIRED: 'Not required',
  MISSING: 'Missing',
  NOT_FAIR_TO_SCORE: 'Not scored',
  INCOMPLETE: 'Incomplete',
} as const;

export default async function CaptainVeoPriorityCard({
  teamId,
  leagueId,
}: {
  teamId: string;
  leagueId: string | null;
}) {
  await requireCaptain(teamId);
  if (!leagueId) return null;

  const [score, weekStatus] = await Promise.all([
    getSixflTvPriorityScore(teamId),
    readThisWeekVeoStatus(leagueId, teamId),
  ]);

  return (
    <section aria-label="SIXFL TV Priority" className="space-y-5 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">📹 SIXFL TV Priority</p>
          <h2 className="mt-2 text-xl font-bold">
            {weekStatus.veoBooked
              ? 'Your match is scheduled to be recorded this week.'
              : score.qualifies
                ? 'Your team currently qualifies for recorded-pitch priority.'
                : 'Improve your score to regain recorded-pitch priority.'}
          </h2>
        </div>
        <SixflTvPriorityScoreBadge score={score} />
      </div>

      <p className="max-w-3xl text-sm leading-6 text-white/80">
        SIXFL TV Priority is <strong>free</strong>. Recorded pitches are prioritised for teams that confirm fixtures,
        pay on time and complete their match reports. A qualifying score improves your chance of being filmed but
        does not guarantee a camera slot.
      </p>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ['10', 'Payment', 'Late = 2'],
          ['4', 'Confirmation', '72h deadline'],
          ['4', 'Match card', 'By 6pm next day'],
          ['1', 'Assists', 'Bonus'],
          ['1', 'Ratings', 'Bonus'],
        ].map(([points, label, help]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-lg font-bold">{points} pts</div>
            <div className="text-xs font-semibold text-white/80">{label}</div>
            <div className="mt-1 text-[11px] text-white/45">{help}</div>
          </div>
        ))}
      </div>

      <p className="text-xs leading-5 text-white/55">
        The score is based on your last five completed fixtures. You need at least <strong>60/100</strong> and
        core match cards completed in at least 60% of scored fixtures. Scores are provisional until five fixtures
        have been recorded.
      </p>

      {score.matches.length ? (
        <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white/85">See recent score breakdown</summary>
          <div className="mt-4 space-y-3">
            {score.matches.map((match) => (
              <div key={match.fixtureId} className="rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">vs {match.opponentName}</strong>
                  <span className="text-sm font-bold">{match.points}/20</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/55">
                  Payment {match.paymentPoints}/10 ({statusText[match.paymentStatus]}) · Confirmation {match.confirmationPoints}/4 ({statusText[match.confirmationStatus]}) · Match card {match.matchCardPoints}/4 ({statusText[match.matchCardStatus]}) · Assists {match.assistsPoints}/1 · Ratings {match.ratingsPoints}/1
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/65">
          New team: your score starts provisionally at 100/100 and will become history-based as completed fixtures are added.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href={`/captain/team/${teamId}/results`} className="inline-flex min-h-11 items-center rounded-xl border border-fuchsia-300/30 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400/10">
          Complete match reports
        </Link>
        <Link href={`/captain/team/${teamId}/payments`} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5">
          Check payments
        </Link>
        {weekStatus.hasMatchThisWeek ? (
          <Link href={`/captain/team/${teamId}/fixtures`} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5">
            Check fixture confirmation
          </Link>
        ) : null}
      </div>
    </section>
  );
}
