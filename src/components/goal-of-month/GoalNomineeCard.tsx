"use client";

import { useState } from "react";
import { getYouTubeVideoId, youtubeEmbedUrl } from "@/lib/youtube";
import type { monthlyCandidatePayload } from "@/lib/goal-of-month/community";

export type GoalNominee = ReturnType<typeof monthlyCandidatePayload>;

type Props = {
  goal: GoalNominee;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  winner?: boolean;
};

export default function GoalNomineeCard({ goal, actionLabel, onAction, disabled, winner }: Props) {
  const [playing, setPlaying] = useState(false);
  const videos = goal.videoUrls.filter(link => {
    try { const url = new URL(link); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  });
  const video = videos.find(link => getYouTubeVideoId(link)) ?? videos[0];
  const videoId = getYouTubeVideoId(video);
  const embed = videoId ? youtubeEmbedUrl(videoId) : null;
  const identity = goal.clipNumber ? `Clip ${goal.clipNumber}` : goal.goalNumber ? `Goal ${goal.goalNumber}` : "Nominated goal";
  const label = `${goal.teamName} v ${goal.opponentName} — ${identity.toLowerCase()}`;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30" data-monthly-goal={goal.id}>
      <div className="relative aspect-video overflow-hidden bg-black">
        {goal.clipVideoUrl ? (
          <video
            controls
            preload="metadata"
            playsInline
            poster={goal.thumbnailUrl ?? undefined}
            src={goal.clipVideoUrl}
            aria-label={`Watch ${label}`}
            className="h-full w-full object-contain"
          />
        ) : playing && embed ? (
          <iframe src={embed} title={`Match footage: ${label}`} className="h-full w-full" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        ) : videoId ? (
          <button type="button" onClick={() => setPlaying(true)} className="relative h-full w-full text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300" aria-label={`Play footage for ${label}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="rounded-full bg-black/80 px-4 py-2 text-sm font-bold">▶ Watch footage</span></span>
          </button>
        ) : video ? (
          <a href={video} target="_blank" rel="noopener noreferrer" className="flex h-full items-center justify-center p-4 text-center text-sm font-bold text-emerald-100">Watch nominated match footage ↗</a>
        ) : <p className="p-4 text-sm text-white/60">Footage currently unavailable.</p>}
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs font-semibold text-fuchsia-200">
          {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${goal.monthKey}-01T12:00:00Z`))} · {identity}
        </p>
        <h3 className="break-words font-bold text-white">{goal.scorerName || goal.teamName}</h3>
        <p className="break-words text-sm text-white/70">{goal.teamName} v {goal.opponentName}</p>
        <p className="text-xs text-white/50">{goal.leagueName} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(goal.kickoffAt))}</p>
        <p className="text-xs text-emerald-100">{goal.nominationCount} nomination{goal.nominationCount === 1 ? "" : "s"}{winner ? ` · ${goal.voteCount} vote${goal.voteCount === 1 ? "" : "s"}` : ""}</p>
        {goal.mediaState === "QUEUED" || goal.mediaState === "PROCESSING" ? (
          <p className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/5 px-2.5 py-2 text-xs leading-5 text-fuchsia-100">
            SIXFL TV is automatically creating the branded Goal of the Month version of this clip.
          </p>
        ) : goal.mediaState === "FAILED" ? (
          <p className="rounded-lg border border-amber-300/20 bg-amber-400/5 px-2.5 py-2 text-xs leading-5 text-amber-100">
            The branded nomination version is not ready yet. The original goal clip remains available.
          </p>
        ) : null}
        {goal.clipNumber ? (
          <p className="text-xs leading-5 text-white/45">This is the exact SIXFL TV Clip {goal.clipNumber} nominated for this goal.</p>
        ) : goal.goalNumber ? (
          <p className="text-xs leading-5 text-white/45">Look for goal {goal.goalNumber} in this fixture’s footage.</p>
        ) : null}
        {!goal.clipVideoUrl && videos.length > 1 ? <div className="flex flex-wrap gap-2">{videos.map((link, i) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-200 underline">Video {i + 1} ↗</a>)}</div> : null}
        {onAction ? <button type="button" onClick={onAction} disabled={disabled} className="w-full rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">{actionLabel}</button> : null}
      </div>
    </article>
  );
}
