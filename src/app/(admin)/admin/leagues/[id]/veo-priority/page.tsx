import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import SixflTvPriorityScoreBadge from '@/components/sixfl-tv/SixflTvPriorityScoreBadge';
import { getSixflTvPriorityScores } from '@/lib/sixfl-tv/priority-score';
import { normaliseVeoPitch } from '@/lib/veo/allocator';
import { londonVeoDate, previewVeoNight, readVeoNight, readVeoSettings, readVeoSnapshots, readVeoTeams, validVeoDate, VeoAllocationError } from '@/lib/veo/service';
import { saveVeoSettings, saveVeoVideo } from './actions';
import FixtureVeoNightPanel from './FixtureVeoNightPanel';
import SubmitButton from './SubmitButton';

export const dynamic = 'force-dynamic';
const time = (date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(date);
const input = 'min-h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white';
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6';

export default async function VeoPriorityPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const league = await prisma.league.findUnique({ where: { id }, select: { id: true, name: true, venueName: true } });
  if (!league) notFound();
  const next = await prisma.fixture.findFirst({ where: { leagueId: id, status: 'SCHEDULED', kickoffAt: { gt: new Date() } }, orderBy: { kickoffAt: 'asc' }, select: { kickoffAt: true } });
  const date = query.date && validVeoDate(query.date) ? query.date : londonVeoDate(next?.kickoffAt ?? new Date());
  const [settings, teams, snapshots, venues, fixtures] = await Promise.all([
    readVeoSettings(id), readVeoTeams(id), readVeoSnapshots(id, date),
    prisma.$queryRaw<{ id: string | null; name: string }[]>`
      SELECT DISTINCT f."venueId" AS id, COALESCE(v.name, ${league.venueName || 'League venue (not set on fixtures)'}) AS name
      FROM "Fixture" f LEFT JOIN "Venue" v ON v.id = f."venueId" WHERE f."leagueId" = ${id}
      UNION SELECT s."venueId" AS id, COALESCE(v.name, ${league.venueName || 'League venue (not set on fixtures)'}) AS name
      FROM "VeoLeagueSettings" s LEFT JOIN "Venue" v ON v.id = s."venueId" WHERE s."leagueId" = ${id}
    `,
    readVeoNight(id, date),
  ]);
  const priorityScores = await getSixflTvPriorityScores(teams.map(team => team.id));
  let choices: Awaited<ReturnType<typeof previewVeoNight>>['choices'] = [];
  let previewError = '';
  try { if (!settings.confirmAtFixture) choices = (await previewVeoNight(id, date)).choices; }
  catch (error) { if (error instanceof VeoAllocationError) previewError = error.message; else throw error; }
  const chosen = new Set(choices.map(c => c.fixtureId));
  const savedById = new Map(snapshots.map(s => [s.fixtureId, s]));
  const priorityIds = new Set<string>();
  const coveredIds = new Set<string>();
  let allocatedCount = 0;
  for (const f of fixtures) {
    const s = savedById.get(f.id);
    const allocated = s?.allocated ?? (chosen.has(f.id) || f.filmed);
    if (s?.homePriority ?? f.homePriority) priorityIds.add(f.homeTeamId);
    if (s?.awayPriority ?? f.awayPriority) priorityIds.add(f.awayTeamId);
    if (allocated) { allocatedCount++; coveredIds.add(f.homeTeamId); coveredIds.add(f.awayTeamId); }
  }
  const missed = [...priorityIds].filter(teamId => !coveredIds.has(teamId)).map(teamId => teams.find(t => t.id === teamId)?.name ?? fixtures.flatMap(f => [{ id: f.homeTeamId, name: f.homeName }, { id: f.awayTeamId, name: f.awayName }]).find(t => t.id === teamId)?.name ?? 'Team');
  const venueOptions = venues.length ? venues : [{ id: null, name: league.venueName || 'League venue (not set on fixtures)' }];

  return <div className="mx-auto max-w-7xl space-y-6 text-white">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">SIXFL TV Priority</h1><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${settings.enabled ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/20 bg-white/5 text-white/70'}`}>{settings.enabled ? 'ON for this league' : 'OFF for this league'}</span></div>
      <p className="max-w-3xl text-sm leading-6 text-white/65">{league.name}. Every team has one SIXFL TV Priority Score out of 100: up to 80 points from reliability, 10 from SIXFL TV audience and 10 from goal-award participation. View Score 100 means average viewing for that team’s current division.</p>
    </header>
    {query.saved && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">Saved. No existing fixtures or charges were recalculated.</p>}
    {query.error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">{query.error.slice(0, 500)}</p>}
    <section className={panel}>
      <h2 className="text-xl font-semibold">League settings</h2>
      <form action={saveVeoSettings.bind(null, id)} className="space-y-5">
        <input type="hidden" name="date" value={date} /><input type="hidden" name="revision" value={settings.revision} />
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-5 w-5" />Enable SIXFL TV recorded-pitch priority</label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2"><span className="block text-sm text-white/70">Veo pitch label</span><input name="pitch" defaultValue={settings.pitch} maxLength={40} placeholder="For example: Pitch 1" className={input} /></label>
          <label className="space-y-2"><span className="block text-sm text-white/70">Maximum filmed matches per night</span><input name="maxMatches" type="number" min={1} max={12} step={1} required defaultValue={settings.maxMatches} className={input} /></label>
        </div>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm text-white/70">Veo venue</legend>{venueOptions.map(v => <label key={v.id ?? 'none'} className="flex min-h-11 items-center gap-3"><input type="radio" name="venueId" value={v.id ?? ''} defaultChecked={v.id === settings.venueId || (venueOptions.length === 1 && settings.revision === 0)} />{v.name}</label>)}</fieldset>
        <p className="text-sm leading-6 text-white/60">Default capacity: three filmed matches for the shared camera evening, not three per division. Fixtures with two eligible high-scoring teams are preferred, then score and previous filming history break ties. A team must also confirm the current fixture before its score can earn priority. Only pitches swap; opponents and kick-off times stay unchanged.</p>
        <SubmitButton>Save league settings</SubmitButton>
      </form>
    </section>
    <section className={panel}>
      <h2 className="text-xl font-semibold">Team Priority scores</h2>
      <p className="text-sm leading-6 text-white/60">
        The one Priority Score is out of 100: reliability contributes up to 80 points, audience up to 10 and goal nominations/voting up to 10. Teams need at least 60/100 overall and must still meet the underlying reliability and core match-card minimums. View Score is an audience index only: 100 means the team is at its division average.
      </p>
      <div className="divide-y divide-white/10">{teams.map(team => {
        const score = priorityScores.get(team.id);
        return <div key={team.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href={`/admin/teams/${team.id}`} className="font-semibold hover:underline">{team.name}</Link>
            <p className="mt-1 text-sm text-white/60">
              {score?.qualifies ? 'Eligible for recorded-pitch priority' : 'Not currently eligible for recorded-pitch priority'}
              {score ? ` · Core cards ${score.coreCompletedMatches}/${score.matchesCount || 0}` : ''}
            </p>
            {score ? <p className="mt-1 text-xs text-white/45">Reliability <strong className="text-white/75">{score.reliabilityPoints}/80</strong> · Audience <strong className="text-white/75">{score.audiencePoints}/10</strong> · Participation <strong className="text-white/75">{score.participationPoints}/10</strong> · View index <strong className="text-fuchsia-100">{score.viewScore}</strong>{score.viewProvisional ? ' provisional' : ''}</p> : null}
          </div>
          {score ? <SixflTvPriorityScoreBadge score={score} /> : null}
        </div>;
      })}{!teams.length && <p className="py-3 text-white/60">No teams are currently linked to this league or its upcoming fixtures.</p>}</div>
    </section>
    {settings.confirmAtFixture && <FixtureVeoNightPanel leagueId={id} date={date} />}
    {(!settings.confirmAtFixture || snapshots.length > 0) && <section className={panel}>
      <h2 className="text-xl font-semibold">Earlier SIXFL TV allocations and publication preview</h2>
      <form method="get" className="flex flex-wrap items-end gap-3"><label className="space-y-2"><span className="block text-sm text-white/70">Match date (UK time)</span><input name="date" type="date" required defaultValue={date} className={input} /></label><button className="min-h-11 rounded-xl border border-white/20 px-4 py-2">Show night</button></form>
      <p className="text-sm leading-6 text-white/60">This older allocation view is retained for filming history only. SIXFL TV Priority is free and no payment information is read or changed here.</p>
      {!settings.enabled && <p className="rounded-xl bg-white/5 p-4 text-sm">SIXFL TV recorded-pitch priority is off. Existing filming allocations remain visible below.</p>}
      {previewError && <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-amber-100">{previewError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{[[String(allocatedCount), 'TV matches: saved + preview'], [String(missed.length), 'Priority teams not allocated']].map(([value, label]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-2xl font-semibold">{value}</div><p className="mt-1 text-xs leading-5 text-white/60">{label}</p></div>)}</div>
      <p className="text-xs leading-5 text-white/50">A TV allocation is a filming plan, not confirmation that footage has been uploaded.</p>
      {missed.length > 0 && <p className="text-sm leading-6 text-amber-100">Not allocated: {missed.join(', ')}. Recorded-pitch priority is not guaranteed even when a team qualifies.</p>}
      <div className="space-y-3">{fixtures.map(f => {
        const saved = savedById.get(f.id); const choice = choices.find(c => c.fixtureId === f.id);
        const displaced = choices.find(c => c.swapWithId === f.id);
        const newPitch = choice?.pitch ?? (displaced ? fixtures.find(x => x.id === displaced.fixtureId)?.pitch : f.pitch);
        const filmed = saved?.allocated ?? (Boolean(choice) || f.filmed);
        return <article key={f.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{time(f.kickoffAt)} · {f.homeName} vs {f.awayName}</h3><p className="mt-1 text-sm text-white/60">Pitch {normaliseVeoPitch(saved?.pitch ?? newPitch ?? null) || 'not set'}{choice?.swapWithId || displaced ? ' · pitch swap proposed' : ''}</p></div><span className="rounded-full border border-white/20 px-3 py-1 text-xs">{filmed ? '📹 Veo / SIXFL TV' : 'Not allocated to Veo'}</span></div>
          <p className="text-xs text-white/50">{saved ? 'Saved filming allocation' : f.locked ? 'Existing / locked fixture' : 'Preview only — not yet saved'}</p>
          {saved?.allocated && <details className="text-sm"><summary className="cursor-pointer py-2 text-fuchsia-200">YouTube / SIXFL TV link</summary><form action={saveVeoVideo.bind(null, id)} className="mt-2 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="date" value={date} /><input type="hidden" name="fixtureId" value={f.id} /><input aria-label={`Video link for ${f.homeName} vs ${f.awayName}`} type="url" name="videoUrl" defaultValue={f.sixflTvUrl ?? ''} placeholder="https://www.youtube.com/watch?v=…" className={input} /><SubmitButton>Save video link</SubmitButton></form></details>}
        </article>;
      })}{!fixtures.length && <p className="py-4 text-white/60">No fixtures on this date.</p>}</div>
      <Link href={`/admin/fixtures?leagueId=${id}`} className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold">Open fixtures to publish</Link>
    </section>}
  </div>;
}
