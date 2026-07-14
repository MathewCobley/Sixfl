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

function normaliseVideoUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
    const url = normaliseVideoUrl(rawUrl);

    if (rawUrl && !url) {
      redirect("/admin/sixfl-tv?error=invalid-url");
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Fixture"
      SET
        "sixflTvRecorded" = ${markedRecorded || Boolean(url)},
        "sixflTvUrl" = ${url},
        "updatedAt" = NOW()
      WHERE "id" = ${fixtureId}
    `);
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/70">
          SIXFL TV
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">Recorded fixture dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fuchsia-50/75">
          View, edit, open, or remove SIXFL TV/Veo links. Removing a link clears the captain dashboard badge and removes the fixture from this list.
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
          Enter a valid http or https video link.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">SIXFL TV fixtures</h2>
          <p className="mt-2 text-sm text-white/55">
            {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} currently marked for SIXFL TV.
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
              const context = [
                fixture.leagueName,
                fixture.leagueSeason,
                fixture.venueName,
              ].filter(Boolean).join(" · ");

              return (
                <div key={fixture.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{fixtureLabel}</h3>
                        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-100">
                          SIXFL TV
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/55">{formatKickoff(fixture.kickoffAt)}</p>
                      <p className="mt-1 text-sm text-white/45">{context}</p>
                      {fixture.sixflTvUrl ? (
                        <a
                          href={fixture.sixflTvUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex text-sm font-semibold text-fuchsia-100 underline-offset-4 hover:underline"
                        >
                          Open current video link
                        </a>
                      ) : (
                        <p className="mt-3 text-sm text-amber-100/80">Marked as recorded, but no video link has been saved.</p>
                      )}
                    </div>

                    <form action={saveSixflTvFixtureAction} className="w-full max-w-xl space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
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
                      <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                        <span>Veo / video link</span>
                        <input
                          type="url"
                          name="sixflTvUrl"
                          defaultValue={fixture.sixflTvUrl ?? ""}
                          placeholder="Paste Veo share link…"
                          className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          name="action"
                          value="save"
                          className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                        >
                          Save
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="remove"
                          className="rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
                        >
                          Remove TV link
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
