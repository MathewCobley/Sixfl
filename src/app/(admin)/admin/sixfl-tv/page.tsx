import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";
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

async function getSixflTvFixtures() {
  return prisma.$queryRaw<TvFixtureRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."kickoffAt",
      f."sixflTvRecorded",
      f."sixflTvUrl",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      COALESCE(v."name", l."venueName") AS "venueName",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName"
    FROM "Fixture" f
    JOIN "League" l ON l."id" = f."leagueId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    LEFT JOIN "Venue" v ON v."id" = f."venueId"
    WHERE f."sixflTvRecorded" = true
       OR f."sixflTvUrl" IS NOT NULL
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

  if (!fixtureId) redirect("/admin/sixfl-tv");

  if (action === "remove") {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Fixture"
      SET
        "sixflTvRecorded" = false,
        "sixflTvUrl" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${fixtureId}
    `);
  } else {
    const parsed = buildSixflTvVideoValue({ highlights, fullMatch, extras });

    if (!parsed.ok) {
      redirect("/admin/sixfl-tv?error=invalid-url");
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Fixture"
      SET
        "sixflTvRecorded" = ${markedRecorded || parsed.count > 0},
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

  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/admin/night-board");
  redirect("/admin/sixfl-tv?saved=1");
}

export default async function AdminSixflTvPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const fixtures = await getSixflTvFixtures();
  const totalLinks = fixtures.reduce(
    (sum, fixture) => sum + getSixflTvVideos(fixture.sixflTvUrl).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/70">
          SIXFL TV
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">Recorded fixture dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fuchsia-50/75">
          Add match highlights, a full match, or both. Either field can be left blank, so a match can be published as full-match-only when no highlights are available. Extra clips are optional.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/night-board"
            className="inline-flex rounded-2xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-black/35"
          >
            Back to Night Board
          </Link>
        </div>
      </div>

      {sp.saved ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          SIXFL TV fixture updated.
        </div>
      ) : null}

      {sp.error === "invalid-url" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          Enter valid http or https video links. Highlights and full match are separate optional fields; enter extra clips one per line.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">SIXFL TV fixtures</h2>
          <p className="mt-2 text-sm text-white/55">
            {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} currently marked for SIXFL TV · {totalLinks} saved video link{totalLinks === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {fixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No SIXFL TV fixtures have been marked yet.
            </div>
          ) : (
            fixtures.map((fixture) => {
              const fixtureLabel = `${fixture.homeTeamName} vs ${fixture.awayTeamName}`;
              const context = [fixture.leagueName, fixture.leagueSeason, fixture.venueName]
                .filter(Boolean)
                .join(" · ");
              const saved = parseSixflTvVideoValue(fixture.sixflTvUrl);
              const videos = getSixflTvVideos(fixture.sixflTvUrl);

              return (
                <div key={fixture.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{fixtureLabel}</h3>
                        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-100">
                          {videos.length} video{videos.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/55">{formatKickoff(fixture.kickoffAt)}</p>
                      <p className="mt-1 text-sm text-white/45">{context}</p>
                      {videos.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {videos.map((video) => (
                            <a
                              key={`${fixture.id}-${video.kind}-${video.url}`}
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                            >
                              Open {video.label.toLowerCase()}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-amber-100/80">
                          Marked as recorded, but no video link has been saved.
                        </p>
                      )}
                    </div>

                    <form action={saveSixflTvFixtureAction} className="w-full max-w-xl space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <input type="hidden" name="fixtureId" value={fixture.id} />
                      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-white/80">
                        <span>Show as SIXFL TV recorded</span>
                        <input
                          type="checkbox"
                          name="sixflTvRecorded"
                          defaultChecked={fixture.sixflTvRecorded}
                          className="h-4 w-4 accent-fuchsia-500"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                          <span>Match highlights <span className="font-normal text-white/40">(optional)</span></span>
                          <input
                            type="url"
                            name="highlightsUrl"
                            defaultValue={saved.highlights ?? ""}
                            placeholder="Highlights link"
                            className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50"
                          />
                        </label>
                        <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                          <span>Full match <span className="font-normal text-white/40">(optional)</span></span>
                          <input
                            type="url"
                            name="fullMatchUrl"
                            defaultValue={saved.fullMatch ?? ""}
                            placeholder="Full match link"
                            className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50"
                          />
                        </label>
                      </div>

                      <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                        <span>Extra clips <span className="font-normal text-white/40">(optional, one per line)</span></span>
                        <textarea
                          name="extraUrls"
                          rows={3}
                          defaultValue={saved.extras.join("\n")}
                          placeholder="Extra clip links, one per line…"
                          className="min-h-[5rem] w-full resize-y rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50"
                        />
                      </label>

                      <p className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/[0.07] px-3 py-2 text-xs leading-5 text-fuchsia-50/70">
                        Highlights-only, full-match-only, or both are all valid. Leave whichever one you do not have blank.
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          name="action"
                          value="save"
                          className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                        >
                          Save links
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="remove"
                          className="rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
                        >
                          Remove all links
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
