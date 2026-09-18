import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";
import FormListboxField from "@/components/ui/FormListboxField";
import {
  buildSixflTvVideoValue,
  getSixflTvVideos,
  parseSixflTvVideoValue,
} from "@/lib/sixfl-tv/videos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TvFixtureRow = {
  id: string;
  kickoffAt: Date;
  status: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  homeTeamName: string;
  awayTeamName: string;
};

function formatKickoff(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

async function getFixtures(query: string, leagueId: string) {
  const search = query ? `%${query}%` : null;
  const leagueFilter = leagueId || null;
  return prisma.$queryRaw<TvFixtureRow[]>(Prisma.sql`
    SELECT
      f."id", f."kickoffAt", f."status", f."sixflTvRecorded", f."sixflTvUrl",
      l."name" AS "leagueName", l."season" AS "leagueSeason",
      COALESCE(v."name", l."venueName") AS "venueName",
      home."name" AS "homeTeamName", away."name" AS "awayTeamName"
    FROM "Fixture" f
    JOIN "League" l ON l."id" = f."leagueId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    LEFT JOIN "Venue" v ON v."id" = f."venueId"
    WHERE f."sixflTvRecorded" = true
      AND (${leagueFilter}::text IS NULL OR f."leagueId" = ${leagueFilter})
      AND (${search}::text IS NULL
        OR l."name" ILIKE ${search}
        OR home."name" ILIKE ${search}
        OR away."name" ILIKE ${search})
    ORDER BY f."kickoffAt" DESC
    LIMIT 200
  `);
}

async function saveSixflTvFixtureAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const highlights = String(formData.get("highlightsUrl") ?? "");
  const fullMatch = String(formData.get("fullMatchUrl") ?? "");
  const extras = String(formData.get("extraUrls") ?? "");
  const markedRecorded = formData.get("sixflTvRecorded") === "on";
  const action = String(formData.get("action") ?? "save");

  if (!fixtureId) redirect("/admin/sixfl-tv/fixtures");

  if (action === "remove") {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Fixture"
      SET "sixflTvRecorded" = false, "sixflTvUrl" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${fixtureId}
    `);
  } else {
    const parsed = buildSixflTvVideoValue({ highlights, fullMatch, extras });
    if (!parsed.ok) redirect("/admin/sixfl-tv/fixtures?error=invalid-url");

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Fixture"
      SET "sixflTvRecorded" = ${markedRecorded || parsed.count > 0},
          "sixflTvUrl" = ${parsed.value},
          "updatedAt" = NOW()
      WHERE "id" = ${fixtureId}
    `);

    if (parsed.count > 0) {
      try {
        await queueSixflTvFixtureUploadedEmailsOnce(fixtureId);
      } catch (error) {
        console.error("Failed to queue SIXFL TV fixture emails", error);
      }
    }
  }

  revalidatePath("/admin/sixfl-tv/fixtures");
  revalidatePath("/admin/night-board");
  redirect("/admin/sixfl-tv/fixtures?saved=1");
}

export default async function SixflTvFixturesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; league?: string; saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const query = String(sp.q ?? "").trim().slice(0, 100);
  const requestedLeague = String(sp.league ?? "").trim().slice(0, 120);
  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "desc" }],
    select: { id: true, name: true, season: true, isActive: true },
  });
  const leagueId = leagues.some(league => league.id === requestedLeague) ? requestedLeague : "";
  const fixtures = await getFixtures(query, leagueId);
  const leagueOptions = [
    { value: "", label: "All leagues" },
    ...leagues.map(league => ({
      value: league.id,
      label: `${league.name}${league.season ? ` — ${league.season}` : ""}${league.isActive ? "" : " · inactive"}`,
    })),
  ];

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold text-emerald-300">SIXFL TV</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Fixtures</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
        Open any match to upload footage, generate previews and manage its SIXFL TV videos.
      </p>
    </header>

    <form method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)_auto] md:items-end">
      <label className="block text-sm text-white/70">
        Team or search term
        <input name="q" defaultValue={query} placeholder="e.g. Northallerton" className="mt-2 block h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15" />
      </label>
      <FormListboxField
        name="league"
        label="League"
        value={leagueId}
        options={leagueOptions}
        placeholder="All leagues"
      />
      <button className="min-h-12 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black transition hover:bg-emerald-300" type="submit">Find fixtures</button>
    </form>

    {sp.saved ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">SIXFL TV fixture updated.</p> : null}
    {sp.error === "invalid-url" ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">Enter valid video links.</p> : null}

    <section className="space-y-4">
      {fixtures.length ? fixtures.map(fixture => {
        const saved = parseSixflTvVideoValue(fixture.sixflTvUrl);
        const videos = getSixflTvVideos(fixture.sixflTvUrl);
        const context = [fixture.leagueName, fixture.leagueSeason, fixture.venueName].filter(Boolean).join(" · ");
        const isLive = videos.length > 0;
        return <article key={fixture.id} className={isLive
          ? "relative overflow-hidden rounded-2xl border border-emerald-400/45 bg-[linear-gradient(110deg,rgba(6,78,59,0.28),rgba(6,95,70,0.16)_45%,rgba(0,0,0,0.15))] p-5 pl-6 shadow-[0_20px_55px_rgba(6,78,59,0.25)] ring-1 ring-emerald-950/50"
          : "relative overflow-hidden rounded-2xl border border-red-400/45 bg-[linear-gradient(110deg,rgba(127,29,29,0.24),rgba(69,10,10,0.14)_45%,rgba(0,0,0,0.15))] p-5 pl-6 shadow-[0_20px_55px_rgba(69,10,10,0.28)] ring-1 ring-red-950/50"
        }>
          <span aria-hidden="true" className={isLive
            ? "absolute inset-y-4 left-0 w-1 rounded-r-full bg-emerald-400/80"
            : "absolute inset-y-4 left-0 w-1 rounded-r-full bg-red-400/70"
          } />
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{fixture.homeTeamName} vs {fixture.awayTeamName}</h2>
                <span className={isLive
                  ? "rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200"
                  : "rounded-full border border-red-400/35 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-200"
                }>
                  {isLive ? "Live" : "Not live"}
                </span>
                {videos.length ? <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100">{videos.length} video{videos.length === 1 ? "" : "s"}</span> : null}
              </div>
              <p className="mt-2 text-sm text-white/55">{formatKickoff(fixture.kickoffAt)}</p>
              <p className="mt-1 text-sm text-white/45">{context}</p>
              {videos.length ? <div className="mt-3 flex flex-wrap gap-2">{videos.map(video =>
                <a key={video.url} href={video.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-50">Open {video.label.toLowerCase()}</a>
              )}</div> : <p className="mt-3 text-sm text-red-100/60">Not live yet — no video links saved.</p>}
            </div>

            <div className="w-full max-w-xl space-y-3">
              <Link href={`/admin/sixfl-tv/footage/${fixture.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                Upload / manage footage
              </Link>
              <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white/75">Video links & display</summary>
                <form action={saveSixflTvFixtureAction} className="mt-4 space-y-4">
                  <input type="hidden" name="fixtureId" value={fixture.id} />
                  <label className="flex items-center justify-between gap-3 text-sm font-semibold text-white/80">
                    <span>Show as SIXFL TV recorded</span>
                    <input type="checkbox" name="sixflTvRecorded" defaultChecked={fixture.sixflTvRecorded} className="h-4 w-4 accent-fuchsia-500" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input type="url" name="highlightsUrl" defaultValue={saved.highlights ?? ""} placeholder="Highlights link" className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white" />
                    <input type="url" name="fullMatchUrl" defaultValue={saved.fullMatch ?? ""} placeholder="Full match link" className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white" />
                  </div>
                  <textarea name="extraUrls" rows={3} defaultValue={saved.extras.join("\n")} placeholder="Extra clip links, one per line…" className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white" />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" name="action" value="save" className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-50">Save links</button>
                    <button type="submit" name="action" value="remove" className="rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100">Remove all links</button>
                  </div>
                </form>
              </details>
            </div>
          </div>
        </article>;
      }) : <p className="rounded-2xl border border-white/10 p-6 text-white/60">No matching fixtures.</p>}
    </section>
  </div>;
}
