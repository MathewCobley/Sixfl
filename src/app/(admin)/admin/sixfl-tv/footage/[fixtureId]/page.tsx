import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { footageFixture, footageState } from "@/lib/sixfl-tv/footage";
import { FootageError, footageId } from "@/lib/sixfl-tv/footage-policy";
import { studioState } from "@/lib/sixfl-tv/studio";
import FootageUploader from "@/components/admin/sixfl-tv/FootageUploader";
import StudioControls from "@/components/admin/sixfl-tv/StudioControls";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function MatchFootagePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  await requireAdmin();
  const fixtureId = footageId((await params).fixtureId);
  const fixture = await footageFixture(fixtureId).catch(error => {
    if (error instanceof FootageError && error.status === 404) notFound();
    throw error;
  });
  const [state, studio] = await Promise.all([footageState(fixtureId), studioState(fixtureId)]);
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }).format(fixture.kickoffAt);
  return <div className="space-y-8">
    <Link href="/admin/sixfl-tv/footage" className="text-sm text-emerald-300">← Choose another fixture</Link>
    <header className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">SIXFL TV · Match studio</p>
      <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</h1>
      <p className="mt-2 text-sm text-white/65">{fixture.league.name} · {date}</p>
      <p className="mt-3 text-sm text-white/75">{fixture.result ? `Saved result: ${fixture.homeTeam.name} ${fixture.result.homeScore} – ${fixture.result.awayScore} ${fixture.awayTeam.name}${fixture.result.isDisputed ? " (disputed — generation is blocked until resolved)" : ""}` : "Result not entered yet. You can upload footage now; branded generation waits for the final result."}</p>
      <p className="mt-2 text-xs text-white/45">Fixture reference: {fixture.id}. Source uploads, private renders, thumbnail saves and YouTube approval are separate steps.</p>
    </header>
    <section className="space-y-4"><div><h2 className="text-xl font-bold text-white">Source footage</h2><p className="mt-1 text-sm text-white/55">Upload once, preview it, and set the editing order. These files remain private.</p></div><FootageUploader key={fixtureId} fixtureId={fixtureId} fixtureLabel={`${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`} initial={state} /></section>
    <section className="space-y-4 border-t border-white/10 pt-8"><StudioControls fixtureId={fixtureId} initial={studio} /></section>
  </div>;
}
