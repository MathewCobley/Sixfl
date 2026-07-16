import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

function normaliseVideoUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseVideoLinks(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true as const, value: null, count: 0, links: [] as string[] };

  const parts = raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalised: string[] = [];
  for (const part of parts) {
    const url = normaliseVideoUrl(part);
    if (!url) return { ok: false as const, value: null, count: 0, links: [] as string[] };
    if (!normalised.includes(url)) normalised.push(url);
  }

  return {
    ok: true as const,
    value: normalised.length ? normalised.join("\n") : null,
    count: normalised.length,
    links: normalised,
  };
}

function getSavedLinks(value: string | null) {
  return parseVideoLinks(value).links;
}

function getLinkLabel(index: number, total: number) {
  if (total === 1) return "Open video";
  if (index === 0) return "Open main video";
  return `Open clip ${index + 1}`;
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

  const fixtureId = String(
    formData.get("sixflTvFixtureId") ?? formData.get("fixtureId") ?? "",
  ).trim();
  const rawUrl = String(formData.get("sixflTvUrl") ?? "").trim();
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
    const parsed = parseVideoLinks(rawUrl);

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
  }

  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");
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
  const totalLinks = fixtures.reduce((sum, fixture) => sum + getSavedLinks(fixture.sixflTvUrl).length, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/70">
          SIXFL TV
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">Recorded fixture dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fuchsia-50/75">
          Manage the exact Veo or YouTube links saved against each fixture. Use one line per clip. The first line is the main/full-match link.
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
          Enter valid http or https video links, one per line.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">SIXFL TV fixtures</h2>
            <p className="mt-2 text-sm text-white/55">
              {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} marked for SIXFL TV · {totalLinks} saved video link{totalLinks === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1 text-sm font-medium text-fuchsia-100">
            {totalLinks} video{totalLinks === 1 ? "" : "s"}
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {fixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No SIXFL TV fixtures have been marked yet.
            </div>
          ) : (
            fixtures.map((fixture) => {
              const fixtureLabel = `${fixture.homeTeamName} vs ${fixture.awayTeamName}`;
              const context = [
                fixture.leagueName,
                fixture.leagueSeason,
                fixture.venueName,
              ].filter(Boolean).join(" · ");
              const links = getSavedLinks(fixture.sixflTvUrl);

              return (
                <article key={fixture.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-start">
                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{fixtureLabel}</h3>
                        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-100">
                          {links.length} video{links.length === 1 ? "" : "s"}
                        </span>
                        {fixture.sixflTvRecorded ? (
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            Recorded
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-white/55">{formatKickoff(fixture.kickoffAt)}</p>
                      <p className="mt-1 text-sm text-white/45">{context}</p>
                    </div>

                    {links.length > 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Saved video links</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {links.map((link, index) => (
                            <a
                              key={`${fixture.id}-${link}`}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                            >
                              {getLinkLabel(index, links.length)}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Marked as recorded, but no video link has been saved.
                      </div>
                    )}
                  </div>

                  <form action={saveSixflTvFixtureAction} className="w-full space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <input type="hidden" name="sixflTvFixtureId" value={fixture.id} />
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/80">
                      <span>Show as SIXFL TV recorded</span>
                      <input
                        type="checkbox"
                        name="sixflTvRecorded"
                        defaultChecked={fixture.sixflTvRecorded}
                        className="h-4 w-4 accent-fuchsia-500"
                      />
                    </label>

                    <label className="block space-y-2 text-sm font-semibold text-white/80">
                      <span>Veo / video links</span>
                      <textarea
                        name="sixflTvUrl"
                        rows={5}
                        defaultValue={fixture.sixflTvUrl ?? ""}
                        placeholder="Paste one Veo or YouTube link per line…"
                        className="min-h-[8rem] w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50"
                      />
                    </label>

                    <p className="text-xs leading-5 text-white/45">
                      One line per clip. The first line is used as the main video link on fixture cards.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="action"
                        value="save"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                      >
                        Save links
                      </button>
                      <button
                        type="submit"
                        name="action"
                        value="remove"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-red-300/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
                      >
                        Remove all
                      </button>
                    </div>
                  </form>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
