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

function ScoreLine({
  label,
  points,
  maxPoints,
}: {
  label: string;
  points: number;
  maxPoints: number;
}) {
  const full = points === maxPoints;
  const partial = points > 0 && points < maxPoints;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={full ? "text-emerald-300" : partial ? "text-amber-300" : "text-red-300"}
        >
          {full ? '✓' : partial ? '!' : '✕'}
        </span>
        <span className="text-xs font-medium text-white/80">{label}</span>
      </div>
      <span className={`shrink-0 text-xs font-bold ${full ? "text-emerald-200" : partial ? "text-amber-200" : "text-red-200"}`}>
        {points}/{maxPoints}
      </span>
    </div>
  );
}

function paymentLabel(status: string) {
  if (status === 'ON_TIME') return 'Paid on time';
  if (status === 'LATE') return 'Paid late';
  if (status === 'UNPAID') return 'Payment overdue';
  return 'No payment penalty';
}

function confirmationLabel(status: string) {
  if (status === 'ON_TIME') return 'Fixture confirmed on time';
  if (status === 'LATE') return 'Fixture confirmed late';
  if (status === 'MISSING') return 'Fixture confirmation missed';
  return 'Confirmation not counted against you';
}

function matchCardLabel(status: string) {
  if (status === 'ON_TIME') return 'Match card completed on time';
  if (status === 'LATE') return 'Match card completed late';
  return 'Match card not completed';
}

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
          ['8', 'Match card', 'By 6pm next day'],
          ['6', 'Payment', 'Late = 2'],
          ['4', 'Confirmation', '72h deadline'],
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
            {score.matches.map((match) => {
              const pointsMissed = Math.max(0, 20 - match.points);

              return (
                <div key={match.fixtureId} className="rounded-xl border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">vs {match.opponentName}</strong>
                    <div className="text-right">
                      <div className="text-sm font-bold">{match.points}/20</div>
                      <div className="text-[11px] text-white/45">
                        {pointsMissed === 0 ? 'Full points' : `${pointsMissed} point${pointsMissed === 1 ? '' : 's'} missed`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <ScoreLine
                      label={matchCardLabel(match.matchCardStatus)}
                      points={match.matchCardPoints}
                      maxPoints={8}
                    />
                    <ScoreLine
                      label={paymentLabel(match.paymentStatus)}
                      points={match.paymentPoints}
                      maxPoints={6}
                    />
                    <ScoreLine
                      label={confirmationLabel(match.confirmationStatus)}
                      points={match.confirmationPoints}
                      maxPoints={4}
                    />
                    <ScoreLine
                      label={match.assistsPoints === 1 ? 'Assists bonus completed' : 'Assists bonus not earned'}
                      points={match.assistsPoints}
                      maxPoints={1}
                    />
                    <ScoreLine
                      label={match.ratingsPoints === 1 ? 'Player ratings completed' : 'Player ratings bonus not earned'}
                      points={match.ratingsPoints}
                      maxPoints={1}
                    />
                  </div>

                  {match.matchCardStatus === 'INCOMPLETE' ? (
                    <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                      <strong>What was missing?</strong> The core match card was incomplete. Save the players who played,
                      goalscorers and Player of the Match by <strong>6pm the following day</strong>.
                    </div>
                  ) : match.matchCardStatus === 'LATE' ? (
                    <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                      <strong>Why were points lost?</strong> The match card was completed after the 6pm deadline, so it earned half of the available match-card points.
                    </div>
                  ) : null}
                </div>
              );
            })}
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
