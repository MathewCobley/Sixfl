import { prisma } from '@/lib/prisma';

type AuditRow = {
  id: string;
  createdAt: Date;
  teamId: string | null;
  teamName: string | null;
  actorName: string | null;
  kind: string | null;
  fixtureId: string | null;
  choice: string | null;
  beforePriority: boolean | null;
  enabledPriority: boolean | null;
  kickoffAt: Date | null;
  homeName: string | null;
  awayName: string | null;
};

const choiceLabel = (value: string | null) =>
  value === 'ONGOING'
    ? 'This & future matches'
    : value === 'MATCH'
      ? 'Just this match'
      : value === 'NONE'
        ? 'No thanks'
        : value || 'Unknown';

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const formatFixture = (row: AuditRow) => {
  if (!row.fixtureId) return null;
  const teams = row.homeName && row.awayName ? `${row.homeName} vs ${row.awayName}` : 'Fixture';
  return row.kickoffAt ? `${teams} · ${formatDateTime(row.kickoffAt)}` : teams;
};

export default async function VeoChoiceHistory({ leagueId }: { leagueId: string }) {
  const rows = await prisma.$queryRaw<AuditRow[]>`
    SELECT
      a.id,
      a."createdAt",
      a."teamId",
      t.name AS "teamName",
      COALESCE(u.name, u.email, 'SIXFL user') AS "actorName",
      a.details ->> 'kind' AS kind,
      a.details ->> 'fixtureId' AS "fixtureId",
      a.details ->> 'choice' AS choice,
      CASE WHEN a.details ? 'before' THEN (a.details ->> 'before')::boolean ELSE NULL END AS "beforePriority",
      CASE WHEN a.details ? 'enabled' THEN (a.details ->> 'enabled')::boolean ELSE NULL END AS "enabledPriority",
      f."kickoffAt",
      h.name AS "homeName",
      aw.name AS "awayName"
    FROM "VeoSettingsAudit" a
    LEFT JOIN "Team" t ON t.id = a."teamId"
    LEFT JOIN "User" u ON u.id = a."actorId"
    LEFT JOIN "Fixture" f ON f.id = a.details ->> 'fixtureId'
    LEFT JOIN "Team" h ON h.id = f."homeTeamId"
    LEFT JOIN "Team" aw ON aw.id = f."awayTeamId"
    WHERE a."leagueId" = ${leagueId}
      AND a.details ->> 'kind' IN ('fixture_veo_choice', 'stop_future_priority', 'team_priority')
    ORDER BY a."createdAt" DESC
    LIMIT 100
  `;

  if (!rows.length) {
    return (
      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
        <h3 className="font-semibold">Veo choice history</h3>
        <p className="text-sm text-white/55">No Veo choice changes have been recorded for this league yet.</p>
      </section>
    );
  }

  const previousByFixture = new Map<string, string>();
  const chronological = [...rows].reverse();
  const display = chronological.map((row) => {
    let description = 'Veo setting changed';
    if (row.kind === 'fixture_veo_choice') {
      const key = `${row.teamId ?? 'unknown'}:${row.fixtureId ?? 'unknown'}`;
      const previous = previousByFixture.get(key);
      description = previous && previous !== row.choice
        ? `${choiceLabel(previous)} → ${choiceLabel(row.choice)}`
        : `Selected ${choiceLabel(row.choice)}`;
      if (row.choice) previousByFixture.set(key, row.choice);
    } else if (row.kind === 'stop_future_priority') {
      description = 'Turned off saved future Veo Priority';
    } else if (row.kind === 'team_priority') {
      const before = row.beforePriority === true ? 'ON' : 'OFF';
      const after = row.enabledPriority === true ? 'ON' : 'OFF';
      description = `Saved future Priority ${before} → ${after}`;
    }
    return { row, description };
  }).reverse();

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div>
        <h3 className="font-semibold">Veo choice history</h3>
        <p className="mt-1 text-xs leading-5 text-white/55">
          Recent captain/admin changes. This is the audit trail to check if a team changed its Veo decision before filming was confirmed.
        </p>
      </div>
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {display.map(({ row, description }) => {
          const fixture = formatFixture(row);
          return (
            <div key={row.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-semibold text-white">{row.teamName ?? 'League setting'}</span>
                  <span className="ml-2 text-fuchsia-100">{description}</span>
                </div>
                <span className="text-xs text-white/45">{formatDateTime(row.createdAt)}</span>
              </div>
              {fixture ? <p className="mt-1 text-xs text-white/55">{fixture}</p> : null}
              <p className="mt-1 text-[11px] text-white/40">By {row.actorName ?? 'SIXFL user'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
