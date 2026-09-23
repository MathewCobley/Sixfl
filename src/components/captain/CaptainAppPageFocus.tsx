"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Focus = {
  text: string;
  href?: string;
  action?: string;
};

function focusFor(pathname: string, teamId: string): Focus | null {
  const base = `/captain/team/${teamId}`;
  if (pathname === base || pathname === `${base}/`) return null;

  if (pathname.startsWith(`${base}/fixtures/`) || pathname === `${base}/fixtures`) {
    return {
      text: "Confirm the team, check the next kick-off and raise any problem with SIXFL here.",
      href: `${base}/availability`,
      action: "Player availability",
    };
  }
  if (pathname.startsWith(`${base}/captain-squad`) || pathname.startsWith(`${base}/squad`)) {
    return {
      text: "Keep the current squad accurate. Edit contact details, regular status and inactive players here.",
      href: `${base}/player-payments`,
      action: "Squad payments",
    };
  }
  if (pathname.startsWith(`${base}/player-payments`)) {
    return {
      text: "Pick the fixture, choose who should pay and check each player’s payment status.",
      href: `${base}/payments`,
      action: "Team balance",
    };
  }
  if (pathname.startsWith(`${base}/payments`)) {
    return {
      text: "What the team owes now comes first. Credit, saved card details and history sit underneath.",
      href: `${base}/player-payments`,
      action: "Player collection",
    };
  }
  if (pathname.startsWith(`${base}/messages`) || pathname.startsWith(`${base}/chat`)) {
    return { text: "Read new SIXFL messages first, then use filters only when you need older history." };
  }
  if (pathname.startsWith(`${base}/availability`)) {
    return {
      text: "Start with the next fixture. The important number is who has not replied yet.",
      href: `${base}/fixtures`,
      action: "Fixture details",
    };
  }
  if (pathname.startsWith(`${base}/results-history`)) {
    return { text: "A simple record of previous scores and predictions. Match reporting is kept separately." };
  }
  if (pathname.startsWith(`${base}/results`)) {
    return {
      text: "Complete players, goals, assists and Player of the Match. Aim to finish by 6pm the next day.",
      href: `${base}/player-stats`,
      action: "Player stats",
    };
  }
  if (pathname.startsWith(`${base}/match-fees`)) {
    return {
      text: "Choose the fixture, select the players who are playing and check what has been collected.",
      href: `${base}/availability`,
      action: "Availability",
    };
  }
  if (pathname.startsWith(`${base}/player-pool`)) {
    return { text: "Only relevant available players are shown. Request an introduction when someone fits the team." };
  }
  if (pathname.startsWith(`${base}/player-stats`)) {
    return { text: "Season leaders first, then the squad table and recent match-by-match reports." };
  }
  if (pathname.startsWith(`${base}/veo-priority`)) {
    return { text: "See the one Priority Score and exactly which recent match actions raised or reduced it." };
  }
  if (pathname.startsWith(`${base}/tv`)) {
    return { text: "Your recorded matches and highlights live here." };
  }
  if (pathname.startsWith(`${base}/kit`)) {
    return { text: "Choose the team kit or review the order already submitted." };
  }
  if (pathname.startsWith(`${base}/weeks-unavailable`)) {
    return { text: "Tell SIXFL early about a week off or a one-off kick-off time restriction." };
  }
  if (pathname.startsWith(`${base}/whatsapp`)) {
    return { text: "Use the ready-made messages or contact individual players without rebuilding the wording each time." };
  }
  if (pathname.startsWith(`${base}/cup-invitations`)) {
    return { text: "Check the deadline, venue, fee and current response. Reply here if the invitation is still open." };
  }
  if (pathname.startsWith(`${base}/rules`)) {
    return { text: "Quick pitch-side rules reference. Open only the section you need." };
  }
  if (pathname.startsWith(`${base}/guide`)) {
    return { text: "Captain responsibilities, league processes and the terms you have agreed to." };
  }
  if (pathname.startsWith(`${base}/help`)) {
    return { text: "Short answers for running the team, with Contact SIXFL when you need a person." };
  }
  if (pathname.startsWith(`${base}/prospects`)) {
    return { text: "Potential players who are not yet part of the active squad." };
  }
  return null;
}

export default function CaptainAppPageFocus({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const focus = focusFor(pathname, teamId);
  if (!focus) return null;

  return (
    <div className="captain-app-focus mx-auto w-full max-w-xl px-3 pt-3">
      <div className="flex items-center justify-between gap-3 rounded-[1.05rem] border border-white/[0.07] bg-white/[0.035] px-3.5 py-3">
        <p className="min-w-0 text-xs leading-5 text-white/55">{focus.text}</p>
        {focus.href && focus.action ? (
          <Link
            href={focus.href}
            className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-100"
          >
            {focus.action}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
