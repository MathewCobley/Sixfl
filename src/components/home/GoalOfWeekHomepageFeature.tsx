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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/you-tube.png"
        alt="YouTube"
        className="h-auto w-full max-w-[340px] object-contain sm:max-w-[400px]"
      />
      <div className="mt-8 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/55 transition group-hover:text-white/75">
        <span>Watch on YouTube</span>
        <span aria-hidden="true">↗</span>
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

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/public/goal-of-week", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: GoalResponse | null) => {
        if (payload?.goal) setGoal(payload.goal);
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
  );
}
