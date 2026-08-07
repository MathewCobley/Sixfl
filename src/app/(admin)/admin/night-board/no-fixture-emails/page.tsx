import Link from "next/link";

import NightBoardNoFixtureEmails from "@/components/admin/night-board/NightBoardNoFixtureEmails";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "No fixture emails | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toLondonDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function buildNightBoardHref(input: {
  date: string;
  leagueId: string;
  venueId: string;
}) {
  const params = new URLSearchParams({ date: input.date });
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (input.venueId) params.set("venueId", input.venueId);
  return `/admin/night-board?${params.toString()}`;
}

export default async function NoFixtureEmailsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = searchParams ? await searchParams : {};
  const requestedDate = getParam(params.date).trim();
  const leagueId = getParam(params.leagueId).trim();
  const venueId = getParam(params.venueId).trim();

  const nextFixture = !isDateInput(requestedDate)
    ? await prisma.fixture.findFirst({
        where: {
          publishedAt: { not: null },
          kickoffAt: { gte: new Date() },
          status: "SCHEDULED",
          ...(leagueId ? { leagueId } : {}),
          ...(venueId ? { venueId } : {}),
        },
        orderBy: { kickoffAt: "asc" },
        select: { kickoffAt: true },
      })
    : null;

  const selectedDate = isDateInput(requestedDate)
    ? requestedDate
    : toLondonDateInput(nextFixture?.kickoffAt ?? new Date());
  const backHref = buildNightBoardHref({ date: selectedDate, leagueId, venueId });

  return (
    <div className="w-full space-y-7 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/80">
              Fixture communications
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              No fixture emails
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Review teams that are available but have no published fixture for the selected week. Emails are manual only — nothing is sent until you press the send button for that team.
            </p>
          </div>
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            Back to Night Board
          </Link>
        </div>

        <form method="get" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          {leagueId ? <input type="hidden" name="leagueId" value={leagueId} /> : null}
          {venueId ? <input type="hidden" name="venueId" value={venueId} /> : null}
          <label className="space-y-1.5 text-sm text-white/60">
            Fixture week
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="block h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-400/40"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
          >
            Check this week
          </button>
        </form>
      </section>

      <NightBoardNoFixtureEmails
        date={selectedDate}
        leagueId={leagueId}
        venueId={venueId}
      />
    </div>
  );
}
