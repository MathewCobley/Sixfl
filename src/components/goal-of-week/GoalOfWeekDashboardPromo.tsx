"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type GoalCandidate = {
  id: string;
};

type GoalPayload = {
  nomination: {
    closesAt: string;
    fixtures: Array<{ id: string }>;
  };
  voting: {
    closesAt: string;
    open: boolean;
    selectedCandidateId: string | null;
    candidates: GoalCandidate[];
  };
  latestWinner: {
    scorerName: string | null;
    teamName: string;
  } | null;
};

function formatDeadline(value: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export default function GoalOfWeekDashboardPromo({
  teamId,
  href,
}: {
  teamId: string;
  href: string;
}) {
  const [payload, setPayload] = useState<GoalPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/goal-of-week/community", {
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as
          | GoalPayload
          | { error?: string }
          | null;

        if (!cancelled && response.ok && result && "nomination" in result) {
          setPayload(result);
        }
      } catch {
        // Keep the generic Goal of the Week promotion visible even if the
        // live ballot endpoint is temporarily unavailable.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const content = useMemo(() => {
    const ballotCount = payload?.voting.candidates.length ?? 0;
    const nominationsAvailable = (payload?.nomination.fixtures.length ?? 0) > 0;
    const votingOpen = Boolean(payload?.voting.open && ballotCount > 0);

    if (votingOpen) {
      const deadline = payload ? formatDeadline(payload.voting.closesAt) : null;
      return {
        eyebrow: "GOAL OF THE WEEK · VOTING OPEN",
        title: "Six goals. One vote. Pick this week’s winner.",
        body: payload?.voting.selectedCandidateId
          ? `Your vote is saved${deadline ? ` — you can change it until ${deadline}` : ""}.`
          : `${ballotCount} nominated goal${ballotCount === 1 ? " is" : "s are"} on the player ballot${deadline ? ` until ${deadline}` : ""}.`,
        cta: payload?.voting.selectedCandidateId ? "View or change my vote" : "Vote now",
        secondary: nominationsAvailable ? "You can also nominate goals from this week’s SIXFL TV matches." : null,
      };
    }

    if (nominationsAvailable) {
      const deadline = payload ? formatDeadline(payload.nomination.closesAt) : null;
      return {
        eyebrow: "GOAL OF THE WEEK · NOMINATIONS OPEN",
        title: "Seen a worldie? Put it forward.",
        body: `Nominate a goal from any completed SIXFL TV match${deadline ? ` before ${deadline}` : ""}. The six most-nominated goals make the Monday–Tuesday player vote.`,
        cta: "Nominate a goal",
        secondary: null,
      };
    }

    if (payload?.latestWinner) {
      const winnerName = payload.latestWinner.scorerName || payload.latestWinner.teamName;
      return {
        eyebrow: "SIXFL GOAL OF THE WEEK",
        title: "Goal of the Week is chosen by SIXFL players.",
        body: `${winnerName} is the latest player-voted winner. Open Goal of the Week to watch, nominate and vote when the next ballot is ready.`,
        cta: "Open Goal of the Week",
        secondary: null,
      };
    }

    return {
      eyebrow: "SIXFL GOAL OF THE WEEK",
      title: "You choose the best goal.",
      body: "SIXFL players can nominate goals from recorded matches, then vote on the six-goal weekly shortlist.",
      cta: "See Goal of the Week",
      secondary: null,
    };
  }, [payload]);

  if (!loaded) {
    return (
      <section className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] p-5 sm:p-6" aria-label="Loading Goal of the Week">
        <div className="h-3 w-44 animate-pulse rounded-full bg-fuchsia-200/15" />
        <div className="mt-4 h-7 w-3/4 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-xl bg-white/[0.06]" />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-fuchsia-300/30 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.22),transparent_38%),linear-gradient(135deg,rgba(88,28,135,0.34),rgba(0,0,0,0.35))] p-5 shadow-[0_20px_70px_rgba(88,28,135,0.2)] sm:p-6" data-testid="goal-of-week-dashboard-promo">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100/75">
            {content.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {content.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fuchsia-50/75 sm:text-base">
            {content.body}
          </p>
          {content.secondary ? (
            <p className="mt-2 text-sm text-fuchsia-100/55">{content.secondary}</p>
          ) : null}
        </div>

        <Link
          href={href}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black text-black shadow-lg shadow-fuchsia-500/20 transition hover:-translate-y-0.5 hover:bg-fuchsia-200"
        >
          {content.cta} →
        </Link>
      </div>
    </section>
  );
}
