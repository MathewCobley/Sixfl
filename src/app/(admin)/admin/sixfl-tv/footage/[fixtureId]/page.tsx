import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { footageFixture, footageState } from "@/lib/sixfl-tv/footage";
import { FootageError, footageId } from "@/lib/sixfl-tv/footage-policy";
import FootageUploader from "@/components/admin/sixfl-tv/FootageUploader";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function MatchFootagePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  await requireAdmin();
  const fixtureId = footageId((await params).fixtureId);
  const fixture = await footageFixture(fixtureId).catch(error => {
    if (error instanceof FootageError && error.status === 404) notFound();
    throw error;
  });
  const state = await footageState(fixtureId);
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }).format(fixture.kickoffAt);
  return <div className="space-y-6">
    <Link href="/admin/sixfl-tv/footage" className="text-sm text-emerald-300">← Choose another fixture</Link>
    <header className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">SIXFL TV · Private footage</p>
      <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</h1>
      <p className="mt-2 text-sm text-white/65">{fixture.league.name} · {date}</p>
      <p className="mt-3 text-sm text-white/75">{fixture.result ? `Saved result: ${fixture.homeTeam.name} ${fixture.result.homeScore} – ${fixture.result.awayScore} ${fixture.awayTeam.name}${fixture.result.isDisputed ? " (disputed — do not publish a result card yet)" : ""}` : "Result not entered yet. You can still upload footage."}</p>
      <p className="mt-2 text-xs text-white/45">Fixture reference: {fixture.id}. Uploading does not change the teams, scores, fixture status or saved YouTube links.</p>
    </header>
    <FootageUploader key={fixtureId} fixtureId={fixtureId} initial={state} />
  </div>;
}
