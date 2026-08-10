"use client";

import { useEffect, useState } from "react";

import { youtubeEmbedUrl } from "@/lib/youtube";

type FeaturedGoal = {
  id: string;
  videoId: string;
  videoUrl: string;
  playerName: string | null;
  opponentName: string | null;
  caption: string | null;
  weekOf: string;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type GoalResponse = {
  goal: FeaturedGoal | null;
  previousGoal?: FeaturedGoal | null;
};

function formatWeek(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function ChannelFallback({ channelUrl }: { channelUrl: string }) {
  return (
    <a
      href={channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[330px] w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/70 p-6 transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-black/80 sm:min-h-[390px] sm:p-8"
      aria-label="Open the SIXFL TV YouTube channel"
    >
      <div className="flex w-full max-w-[360px] items-center justify-center gap-4 rounded-3xl border border-red-400/20 bg-red-500/[0.08] px-6 py-7 shadow-[0_18px_55px_rgba(239,68,68,0.12)]">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-2xl bg-red-600 shadow-[0_12px_34px_rgba(220,38,38,0.3)]">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-9 w-9 fill-white"
          >
            <path d="M8 5.5v13l10-6.5-10-6.5Z" />
          </svg>
        </div>
        <div className="text-left">
          <div className="text-2xl font-black tracking-tight text-white sm:text-3xl">YouTube</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">SIXFL TV</div>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/55 transition group-hover:text-white/75">
        <span>Watch on YouTube</span>
        <span aria-hidden="true">↗</span>
      </div>
    </a>
  );
}

function PreviousGoalCard({ goal }: { goal: FeaturedGoal }) {
  const leagueLabel = [goal.leagueName, goal.leagueSeason]
    .filter(Boolean)
    .join(" · ");
  const thumbnailUrl = `https://i.ytimg.com/vi/${goal.videoId}/hqdefault.jpg`;

  return (
    <a
      href={goal.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-3xl border border-violet-300/20 bg-black/55 transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-black/65"
      aria-label={`Watch previous Goal of the Week by ${goal.teamName} on YouTube`}
    >
      <div className="grid sm:grid-cols-[150px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[150px_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden bg-black sm:aspect-auto lg:aspect-video xl:aspect-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-black/30">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-0.5 h-5 w-5 fill-white">
                <path d="M8 5.5v13l10-6.5-10-6.5Z" />
              </svg>
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200/80">
              Previous Goal of the Week
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              {formatWeek(goal.weekOf)}
            </span>
          </div>
          <h4 className="mt-3 text-lg font-black text-white">{goal.teamName}</h4>
          {goal.playerName || goal.opponentName ? (
            <p className="mt-1 text-xs font-semibold text-white/70">
              {goal.playerName || "SIXFL goal"}
              {goal.opponentName ? ` · vs ${goal.opponentName}` : ""}
            </p>
          ) : null}
          {leagueLabel ? (
            <p className="mt-2 text-[11px] text-white/40">{leagueLabel}</p>
          ) : null}
          <div className="mt-3 text-xs font-extrabold text-violet-100">
            Watch previous winner ↗
          </div>
        </div>
      </div>
    </a>
  );
}

export default function GoalOfWeekHomepageFeature({
  channelUrl,
}: {
  channelUrl: string;
}) {
  const [goal, setGoal] = useState<FeaturedGoal | null>(null);
  const [previousGoal, setPreviousGoal] = useState<FeaturedGoal | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/public/goal-of-week", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: GoalResponse | null) => {
        if (payload?.goal) setGoal(payload.goal);
        setPreviousGoal(payload?.previousGoal ?? null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load Goal of the Week", error);
      });

    return () => controller.abort();
  }, []);

  const embedUrl = goal ? youtubeEmbedUrl(goal.videoId) : null;

  if (!goal || !embedUrl) {
    return <ChannelFallback channelUrl={channelUrl} />;
  }

  const leagueLabel = [goal.leagueName, goal.leagueSeason]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <article className="overflow-hidden rounded-3xl border border-fuchsia-300/25 bg-black/75 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          <iframe
            src={embedUrl}
            title={`SIXFL Goal of the Week by ${goal.teamName}`}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100">
              Goal of the Week
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Week of {formatWeek(goal.weekOf)}
            </span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            {goal.teamLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={goal.teamLogoUrl}
                alt={`${goal.teamName} badge`}
                className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 bg-white/5 object-contain p-1.5"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-black text-white/70">
                {goal.teamName.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h3 className="truncate text-xl font-black text-white">{goal.teamName}</h3>
              {leagueLabel ? (
                <p className="mt-1 truncate text-xs text-white/45">{leagueLabel}</p>
              ) : null}
            </div>
          </div>

          {goal.playerName || goal.opponentName ? (
            <p className="mt-4 text-sm font-semibold text-white/85">
              {goal.playerName ? goal.playerName : "SIXFL goal"}
              {goal.opponentName ? ` · vs ${goal.opponentName}` : ""}
            </p>
          ) : null}

          {goal.caption ? (
            <p className="mt-3 text-sm leading-6 text-white/62">{goal.caption}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={goal.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-xs font-extrabold text-black transition hover:bg-white/90"
            >
              Watch on YouTube ↗
            </a>
            <a
              href="/goal-of-the-week"
              className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2.5 text-xs font-extrabold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
            >
              Nominate & vote
            </a>
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/10"
            >
              More SIXFL TV
            </a>
          </div>
        </div>
      </article>

      {previousGoal ? <PreviousGoalCard goal={previousGoal} /> : null}
    </div>
  );
}
