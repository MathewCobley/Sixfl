import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { resolveTeamFixtureFeePence } from '@/lib/payments/fixture-fee-policy';
import { normaliseVeoPitch } from '@/lib/veo/allocator';
import { londonVeoDate, previewVeoNight, quoteVeoFixture, readVeoNight, readVeoSettings, readVeoSnapshots, readVeoTeams, validVeoDate, VeoAllocationError } from '@/lib/veo/service';
import { saveVeoSettings, setVeoTeamPriority, saveVeoVideo } from './actions';
import SubmitButton from './SubmitButton';

export const dynamic = 'force-dynamic';
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
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
  let choices: Awaited<ReturnType<typeof previewVeoNight>>['choices'] = [];
  let previewError = '';
  try { choices = (await previewVeoNight(id, date)).choices; }
  catch (error) { if (error instanceof VeoAllocationError) previewError = error.message; else throw error; }
  const chosen = new Set(choices.map(c => c.fixtureId));
  const savedById = new Map(snapshots.map(s => [s.fixtureId, s]));
  const priorityIds = new Set<string>();
  const coveredIds = new Set<string>();
  let supplement = 0;
  let allocatedCount = 0;
  for (const f of fixtures) {
    const s = savedById.get(f.id);
    const allocated = s?.allocated ?? (chosen.has(f.id) || f.filmed);
    if (s?.homePriority ?? f.homePriority) priorityIds.add(f.homeTeamId);
    if (s?.awayPriority ?? f.awayPriority) priorityIds.add(f.awayTeamId);
    if (allocated) { allocatedCount++; coveredIds.add(f.homeTeamId); coveredIds.add(f.awayTeamId); }
    if (s) supplement += s.homeSupplementPence + s.awaySupplementPence;
    else if (!f.locked && f.eligible) { const q = quoteVeoFixture(f, chosen.has(f.id)); supplement += q.home.supplementPence + q.away.supplementPence; }
  }
  const missed = [...priorityIds].filter(teamId => !coveredIds.has(teamId)).map(teamId => teams.find(t => t.id === teamId)?.name ?? fixtures.flatMap(f => [{ id: f.homeTeamId, name: f.homeName }, { id: f.awayTeamId, name: f.awayName }]).find(t => t.id === teamId)?.name ?? 'Team');
  const venueOptions = venues.length ? venues : [{ id: null, name: league.venueName || 'League venue (not set on fixtures)' }];

  return <div className="mx-auto max-w-7xl space-y-6 text-white">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">Veo Priority</h1><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${settings.enabled ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/20 bg-white/5 text-white/70'}`}>{settings.enabled ? 'ON for this league' : 'OFF for this league'}</span></div>
      <p className="max-w-3xl text-sm leading-6 text-white/65">{league.name}. Priority teams pay their normal match fee plus £5 only when allocated to a Veo match. Other teams keep their normal fee, even when filmed. Free matches stay free.</p>
    </header>
    {query.saved && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">Saved. No existing fixtures or charges were recalculated.</p>}
    {query.error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">{query.error.slice(0, 500)}</p>}
    <section className={panel}>
      <h2 className="text-xl font-semibold">League settings</h2>
      <form action={saveVeoSettings.bind(null, id)} className="space-y-5">
        <input type="hidden" name="date" value={date} /><input type="hidden" name="revision" value={settings.revision} />
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-5 w-5" />Enable Veo Priority for future fixture publication</label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2"><span className="block text-sm text-white/70">Veo pitch label</span><input name="pitch" defaultValue={settings.pitch} maxLength={40} placeholder="For example: Pitch 1" className={input} /></label>
          <label className="space-y-2"><span className="block text-sm text-white/70">Maximum filmed matches per night</span><input name="maxMatches" type="number" min={1} max={12} step={1} required defaultValue={settings.maxMatches} className={input} /></label>
        </div>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm text-white/70">Veo venue</legend>{venueOptions.map(v => <label key={v.id ?? 'none'} className="flex min-h-11 items-center gap-3"><input type="radio" name="venueId" value={v.id ?? ''} defaultChecked={v.id === settings.venueId || (venueOptions.length === 1 && settings.revision === 0)} />{v.name}</label>)}</fieldset>
        <p className="text-sm leading-6 text-white/60">Default capacity: three matches. Allocation prefers Priority-v-Priority fixtures, then gives preference to teams with fewer previous filmed games. It only swaps pitches at the same venue and kick-off time. Published, billed, past and manually marked TV fixtures are left alone.</p>
        <SubmitButton>Save league settings</SubmitButton>
      </form>
    </section>
    <section className={panel}>
      <h2 className="text-xl font-semibold">Team Priority</h2>
      <p className="text-sm leading-6 text-white/60">Record the captain’s agreement before opting a team in. Priority is not a guarantee of filming. Changing a switch affects future publications only; it never changes a saved fixture price. No announcement or payment message is sent by these switches.</p>
      <div className="divide-y divide-white/10">{teams.map(team => <div key={team.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><Link href={`/admin/teams/${team.id}`} className="font-semibold hover:underline">{team.name}</Link><p className="mt-1 text-sm text-white/60">{team.teamMode === 'STANDARD' ? `Normal fee ${money(team.standardMatchFeePence ?? 4000)} · Priority ${team.priority ? 'ON' : 'OFF'}` : 'Managed team — Priority not available'}</p></div>
        {team.teamMode === 'STANDARD' && <form action={setVeoTeamPriority.bind(null, id)} className="flex flex-wrap items-center gap-3 sm:max-w-md">
          <input type="hidden" name="date" value={date} /><input type="hidden" name="teamId" value={team.id} /><input type="hidden" name="previous" value={team.priority ? '1' : '0'} /><input type="hidden" name="enabled" value={team.priority ? '0' : '1'} />
          {!team.priority && <label className="flex items-start gap-2 text-xs leading-5 text-white/70"><input type="checkbox" name="agreed" required className="mt-1" />Captain has agreed to the £5 filmed-match supplement</label>}
          <SubmitButton>{team.priority ? 'Switch Priority off' : 'Switch Priority on'}</SubmitButton>
        </form>}
      </div>)}{!teams.length && <p className="py-3 text-white/60">No teams are currently linked to this league or its upcoming fixtures.</p>}</div>
    </section>
    <section className={panel}>
      <h2 className="text-xl font-semibold">Match-night preview and saved allocations</h2>
      <form method="get" className="flex flex-wrap items-end gap-3"><label className="space-y-2"><span className="block text-sm text-white/70">Match date (UK time)</span><input name="date" type="date" required defaultValue={date} className={input} /></label><button className="min-h-11 rounded-xl border border-white/20 px-4 py-2">Show night</button></form>
      <p className="text-sm leading-6 text-white/60">This preview does not save anything. Use the normal Publish fixtures action for the whole league night, without a division filter. Allocation and the £5 price snapshots are saved together with publication. Settings can change the preview until then.</p>
      {!settings.enabled && <p className="rounded-xl bg-white/5 p-4 text-sm">Veo is off. No new allocations or supplements will be added. Existing saved agreements remain visible below.</p>}
      {previewError && <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-amber-100">{previewError}</p>}
      <div className="grid gap-3 sm:grid-cols-3">{[[String(allocatedCount), 'TV matches: saved + preview'], [String(missed.length), 'Priority teams not allocated'], [money(supplement), 'Veo supplement value: saved + preview']].map(([value, label]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="text-2xl font-semibold">{value}</div><p className="mt-1 text-xs leading-5 text-white/60">{label}</p></div>)}</div>
      <p className="text-xs leading-5 text-white/50">Supplement value is the original agreement or preview, not cash received. Payment corrections and refunds are tracked in Payments. A TV allocation is a filming plan, not confirmation that footage has been uploaded.</p>
      {missed.length > 0 && <p className="text-sm leading-6 text-amber-100">Not allocated: {missed.join(', ')}. No new Veo supplement is added for these teams.</p>}
      <div className="space-y-3">{fixtures.map(f => {
        const saved = savedById.get(f.id); const choice = choices.find(c => c.fixtureId === f.id);
        const displaced = choices.find(c => c.swapWithId === f.id);
        const newPitch = choice?.pitch ?? (displaced ? fixtures.find(x => x.id === displaced.fixtureId)?.pitch : f.pitch);
        const filmed = saved?.allocated ?? (Boolean(choice) || f.filmed);
        const q = !f.locked && f.eligible ? quoteVeoFixture(f, Boolean(choice)) : null;
        const fees = saved ? [{ name: f.homeName, base: saved.homeBasePence, extra: saved.homeSupplementPence }, { name: f.awayName, base: saved.awayBasePence, extra: saved.awaySupplementPence }]
          : q ? [{ name: f.homeName, base: q.home.basePence, extra: q.home.supplementPence }, { name: f.awayName, base: q.away.basePence, extra: q.away.supplementPence }]
          : [{ name: f.homeName, base: resolveTeamFixtureFeePence(f.homeMatchFeePence, f.homeStandard, f.matchFeePence), extra: 0 }, { name: f.awayName, base: resolveTeamFixtureFeePence(f.awayMatchFeePence, f.awayStandard, f.matchFeePence), extra: 0 }];
        return <article key={f.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{time(f.kickoffAt)} · {f.homeName} vs {f.awayName}</h3><p className="mt-1 text-sm text-white/60">Pitch {normaliseVeoPitch(saved?.pitch ?? newPitch ?? null) || 'not set'}{choice?.swapWithId || displaced ? ' · pitch swap proposed' : ''}</p></div><span className="rounded-full border border-white/20 px-3 py-1 text-xs">{filmed ? '📹 Veo / SIXFL TV' : 'Not allocated to Veo'}</span></div>
          <p className="text-xs text-white/50">{saved ? 'Saved at publication — original price snapshot' : f.locked ? 'Existing / locked fixture — unchanged by Veo' : 'Preview only — not yet saved'}</p>
          <div className="grid gap-2 sm:grid-cols-2">{fees.map(fee => <p key={fee.name} className="text-sm leading-6"><span className="text-white/65">{fee.name}: </span>{money(fee.base)}{fee.extra > 0 && ` + ${money(fee.extra)} Veo Priority`}<strong> = {money(fee.base + fee.extra)}</strong></p>)}</div>
          {saved?.allocated && <details className="text-sm"><summary className="cursor-pointer py-2 text-fuchsia-200">YouTube / SIXFL TV link</summary><form action={saveVeoVideo.bind(null, id)} className="mt-2 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="date" value={date} /><input type="hidden" name="fixtureId" value={f.id} /><input aria-label={`Video link for ${f.homeName} vs ${f.awayName}`} type="url" name="videoUrl" defaultValue={f.sixflTvUrl ?? ''} placeholder="https://www.youtube.com/watch?v=…" className={input} /><SubmitButton>Save video link</SubmitButton></form></details>}
        </article>;
      })}{!fixtures.length && <p className="py-4 text-white/60">No fixtures on this date.</p>}</div>
      <Link href={`/admin/fixtures?leagueId=${id}`} className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold">Open fixtures to publish</Link>
    </section>
  </div>;
}
