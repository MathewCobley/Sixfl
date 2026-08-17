import Link from "next/link";

import {
  getHomepageLeagues,
  type HomepageLeague,
  type HomepageLeagueStage,
} from "@/lib/leagues/homepage-leagues";

function formatDay(value: string | null) {
  if (!value) return "Night TBC";
  if (value === "ANY") return "Night TBC";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatMoney(value: number | null) {
  if (value === null) return "£40";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function formatStartDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function stageCopy(stage: HomepageLeagueStage) {
  switch (stage) {
    case "LIVE":
      return { badge: "Fixtures live", eyebrow: "LIVE NOW" };
    case "FORMING":
      return { badge: "Forming now", eyebrow: "NEW LEAGUE" };
    case "PLANNED":
      return { badge: "Early interest", eyebrow: "COMING NEXT" };
    default:
      return { badge: "Hidden", eyebrow: "HIDDEN" };
  }
}

function buildFallbackBody(league: HomepageLeague) {
  const day = formatDay(league.dayOfWeek);
  const venue = league.venueName?.trim();
  const area = league.area?.trim() || league.name;

  if (league.homepageStage === "LIVE") {
    return `${day} 6-a-side football${venue ? ` at ${venue}` : ` in ${area}`}. View the current league, fixtures, results and table.`;
  }

  if (league.homepageStage === "PLANNED") {
    return `SIXFL is exploring a new ${day.toLowerCase()} league${venue ? ` at ${venue}` : ` in ${area}`}. Register early interest as a team or individual player.`;
  }

  return `A new ${day.toLowerCase()} SIXFL league is forming${venue ? ` at ${venue}` : ` in ${area}`}. Full teams and individual players can register now.`;
}

function LeagueLaunchCard({ league }: { league: HomepageLeague }) {
  const copy = stageCopy(league.homepageStage);
  const proposedStart = formatStartDate(league.proposedStartDate);
  const price = formatMoney(league.costPerTeamPerMatchPence);
  const targetLabel = league.targetTeamCount
    ? `Target ${league.targetTeamCount} teams`
    : null;
  const isLive = league.homepageStage === "LIVE";
  const isForming = league.homepageStage === "FORMING";
  const detailsHref = `/leagues/${league.slug}`;
  const primaryHref = isLive
    ? detailsHref
    : `/leagues/${league.slug}?type=team#register`;
  const secondaryHref = isLive
    ? `/leagues/${league.slug}/fixtures`
    : `/leagues/${league.slug}?type=player#register`;

  return (
    <article
      className={[
        "group relative overflow-hidden rounded-[1.75rem] border p-5 shadow-[0_22px_85px_rgba(0,0,0,0.34)] sm:p-6",
        isLive
          ? "border-emerald-400/25 bg-emerald-500/[0.07]"
          : isForming
            ? "border-sky-400/25 bg-sky-500/[0.065]"
            : "border-white/10 bg-white/[0.035]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.07),transparent_34%)] opacity-70" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
            {copy.eyebrow}
          </p>
          <span
            className={[
              "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
              isLive
                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                : isForming
                  ? "border-sky-300/25 bg-sky-400/10 text-sky-100"
                  : "border-white/10 bg-white/[0.05] text-white/65",
            ].join(" ")}
          >
            {copy.badge}
          </span>
        </div>

        <h3 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl">
          {league.name}
        </h3>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-white/65">
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5">
            {formatDay(league.dayOfWeek)}
          </span>
          {league.venueName ? (
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5">
              {league.venueName}
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5">
            {price} / team
          </span>
        </div>

        <p className="mt-4 text-sm leading-7 text-white/65 sm:text-base">
          {league.description?.trim() || buildFallbackBody(league)}
        </p>

        {!isLive ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {proposedStart ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                  Planned start
                </p>
                <p className="mt-1 text-sm font-bold text-white">{proposedStart}</p>
              </div>
            ) : null}
            {targetLabel ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                  League size
                </p>
                <p className="mt-1 text-sm font-bold text-white">{targetLabel}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-black/25 p-3 text-sm text-white/65">
            {league.teamCount > 0
              ? `${league.teamCount} team${league.teamCount === 1 ? "" : "s"} in the current league.`
              : "Fixtures, results and standings are live."}
          </div>
        )}

        {isLive ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-emerald-400 px-5 text-center text-sm font-black text-black transition hover:bg-emerald-300"
            >
              View league
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 text-center text-sm font-black text-white transition hover:bg-white/[0.09]"
            >
              View fixtures
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <Link
              href={detailsHref}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/[0.10] px-5 text-center text-sm font-black text-sky-50 transition hover:bg-sky-400/[0.16]"
            >
              View details
            </Link>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-emerald-400 px-5 text-center text-sm font-black text-black transition hover:bg-emerald-300"
              >
                {league.homepageStage === "PLANNED" ? "Register early interest" : "Enter a team"}
              </Link>
              <Link
                href={secondaryHref}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 text-center text-sm font-black text-white transition hover:bg-white/[0.09]"
              >
                Join as a player
              </Link>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function LeagueGroup({
  id,
  eyebrow,
  title,
  copy,
  leagues,
}: {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  leagues: HomepageLeague[];
}) {
  if (leagues.length === 0) return null;

  return (
    <section id={id} className="mt-10 scroll-mt-24 lg:mt-12">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300/75">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/55 sm:text-base">
            {copy}
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/55">
          {leagues.length} league{leagues.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {leagues.map((league) => (
          <LeagueLaunchCard key={league.id} league={league} />
        ))}
      </div>
    </section>
  );
}

export default async function HomepageLeagueDirectory() {
  const leagues = await getHomepageLeagues();
  const live = leagues.filter((league) => league.homepageStage === "LIVE");
  const forming = leagues.filter((league) => league.homepageStage === "FORMING");
  const planned = leagues.filter((league) => league.homepageStage === "PLANNED");

  return (
    <div data-testid="homepage-league-directory">
      <LeagueGroup
        id="live-leagues"
        eyebrow="PLAYING NOW"
        title="Live SIXFL leagues"
        copy="See the real fixtures, results and tables before deciding where you want to play."
        leagues={live}
      />
      <LeagueGroup
        id="forming-leagues"
        eyebrow="FORMING NOW"
        title="Leagues forming now"
        copy="We’re actively building these new SIXFL leagues now. Register your team or join as a player."
        leagues={forming}
      />
      <LeagueGroup
        id="planned-leagues"
        eyebrow="COMING NEXT"
        title="Register early interest"
        copy="Help us decide where demand is strongest. Planned leagues move into Forming once the venue and launch plan are ready."
        leagues={planned}
      />
    </div>
  );
}
