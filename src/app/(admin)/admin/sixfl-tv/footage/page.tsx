import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function FootageFixturesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  await requireAdmin();
  const query = String((await searchParams)?.q || "").trim().slice(0, 100);
  const fixtures = await prisma.fixture.findMany({
    where: query ? { OR: [
      { league: { name: { contains: query, mode: "insensitive" } } },
      { homeTeam: { name: { contains: query, mode: "insensitive" } } },
      { awayTeam: { name: { contains: query, mode: "insensitive" } } },
    ] } : { kickoffAt: { lte: new Date(Date.now() + 14 * 86400000) } },
    orderBy: { kickoffAt: "desc" }, take: 100,
    select: { id: true, kickoffAt: true, status: true, league: { select: { name: true } },
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-emerald-300">SIXFL TV</p><h1 className="mt-2 text-3xl font-bold text-white">Upload match footage</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Choose the actual fixture before uploading clips or the full match. Files are saved privately in SIXFL cloud storage, not published or sent to players. A result is not required just to upload.</p></header>
    <form method="get" className="flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm text-white/70">League or team name<input name="q" defaultValue={query} placeholder="e.g. Northallerton" className="mt-2 block w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white" /></label><button className="min-h-11 self-end rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black" type="submit">Find fixtures</button></form>
    <p className="text-sm text-white/50">Showing up to 100 fixtures, newest first. Search a league or team to find an older match.</p>
    <section className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
      {fixtures.length ? fixtures.map(f => <div key={f.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div><h2 className="font-semibold text-white">{f.homeTeam.name} vs {f.awayTeam.name}</h2><p className="mt-1 text-sm text-white/60">{date.format(f.kickoffAt)} · {f.league.name} · {f.status.toLowerCase()}</p></div>
        <Link href={`/admin/sixfl-tv/footage/${f.id}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">Upload / manage footage</Link>
      </div>) : <p className="p-6 text-white/60">No matching fixtures. Try a shorter league or team name.</p>}
    </section>
  </div>;
}
