import CaptainVeoBookings from '@/components/captain/CaptainVeoBookings';
import type { ReactNode } from 'react';
import { prisma } from '@/lib/prisma';
import { requireCaptain } from '@/lib/requireCaptain';
import SixflTvFixtureBadge from '@/components/sixfl-tv/SixflTvFixtureBadge';

type Row = { fixtureId: string; kickoffAt: Date; allocated: boolean; priority: boolean; base: number; extra: number; opponent: string; url: string | null };
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

export default async function CaptainFixturesLayout({ children, params }: { children: ReactNode; params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s."fixtureId", s."kickoffAt", s.allocated, f."sixflTvUrl" AS url,
      CASE WHEN s."homeTeamId" = ${teamid} THEN s."homePriority" ELSE s."awayPriority" END AS priority,
      CASE WHEN s."homeTeamId" = ${teamid} THEN s."homeBasePence" ELSE s."awayBasePence" END AS base,
      CASE WHEN s."homeTeamId" = ${teamid} THEN s."homeSupplementPence" ELSE s."awaySupplementPence" END AS extra,
      opponent.name AS opponent
    FROM "VeoFixtureSnapshot" s JOIN "Fixture" f ON f.id = s."fixtureId"
    JOIN "Team" opponent ON opponent.id = CASE WHEN s."homeTeamId" = ${teamid} THEN s."awayTeamId" ELSE s."homeTeamId" END
    WHERE (s."homeTeamId" = ${teamid} OR s."awayTeamId" = ${teamid}) AND f."publishedAt" IS NOT NULL
      AND f.status::text NOT IN ('CANCELLED', 'POSTPONED') AND s."kickoffAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
    ORDER BY s."kickoffAt" LIMIT 8
  `;
  return <div className="space-y-6">
    {rows.length > 0 && <section className="space-y-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-5 text-white">
      <h2 className="text-lg font-semibold">Earlier Veo allocations</h2>
      <p className="text-sm leading-6 text-white/65">SIXFL TV Priority is now free and score-based. This section preserves older Veo allocation records and any price agreed before the new system launched.</p>
      {rows.map(row => <div key={row.fixtureId} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center gap-3"><strong>vs {row.opponent}</strong><span className="text-sm text-white/65">{new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(row.kickoffAt)}</span><SixflTvFixtureBadge recorded={row.allocated} url={row.url} /></div>
        <p className="text-sm leading-6">{row.allocated ? '📹 Allocated for filming.' : row.priority ? 'Older Priority record — no filming slot on this fixture.' : 'No Veo allocation.'}</p>
        <p className="text-sm">Match fee {money(row.base)}{row.extra > 0 && ` + older Veo Priority ${money(row.extra)}`}<strong> = {money(row.base + row.extra)}</strong></p>
      </div>)}
      <p className="text-xs leading-5 text-white/50">Any extra shown here is an older saved agreement. New SIXFL TV Priority bookings have no filming supplement. Payments shows any later corrections or refunds.</p>
    </section>}
    <CaptainVeoBookings teamId={teamid} />
    {children}
  </div>;
}
