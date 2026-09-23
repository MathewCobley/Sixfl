"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function sectionTitle(pathname: string, teamId: string) {
  const base = `/captain/team/${teamId}`;
  if (pathname === base || pathname === `${base}/`) return "Home";
  if (pathname.startsWith(`${base}/fixtures/`) || pathname === `${base}/fixtures`) return "Fixtures";
  if (pathname.startsWith(`${base}/captain-squad`) || pathname.startsWith(`${base}/squad`)) return "Squad";
  if (pathname.startsWith(`${base}/player-payments`)) return "Squad payments";
  if (pathname.startsWith(`${base}/payments`)) return "Team payments";
  if (pathname.startsWith(`${base}/messages`) || pathname.startsWith(`${base}/chat`)) return "Inbox";
  if (pathname.startsWith(`${base}/availability`)) return "Availability";
  if (pathname.startsWith(`${base}/results-history`)) return "Team results";
  if (pathname.startsWith(`${base}/results`)) return "Match reports";
  if (pathname.startsWith(`${base}/match-fees`)) return "Matchday squad";
  if (pathname.startsWith(`${base}/player-pool`)) return "PlayerPool";
  if (pathname.startsWith(`${base}/player-stats`)) return "Player stats";
  if (pathname.startsWith(`${base}/veo-priority`)) return "Priority score";
  if (pathname.startsWith(`${base}/tv`)) return "SIXFL TV";
  if (pathname.startsWith(`${base}/kit`)) return "Team kit";
  if (pathname.startsWith(`${base}/weeks-unavailable`)) return "Fixture planning";
  if (pathname.startsWith(`${base}/whatsapp`)) return "WhatsApp";
  if (pathname.startsWith(`${base}/cup-invitations`)) return "Cup invitations";
  if (pathname.startsWith(`${base}/rules`)) return "Match rules";
  if (pathname.startsWith(`${base}/guide`)) return "Captain guide";
  if (pathname.startsWith(`${base}/help`)) return "Help";
  if (pathname.startsWith(`${base}/prospects`)) return "Prospects";
  if (pathname.startsWith(`${base}/more`)) return "More";
  return "Captain";
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

export default function CaptainAppHeader({
  teamId,
  teamName,
  teamLogoUrl,
}: {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
}) {
  const pathname = usePathname();
  const title = sectionTitle(pathname, teamId);

  return (
    <header
      className="captain-app-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#06110e]/95 px-4 pb-3 backdrop-blur-xl"
      style={{ paddingTop: "max(env(safe-area-inset-top), 0.8rem)" }}
    >
      <div className="mx-auto flex w-full max-w-xl items-center gap-3">
        <Link href={`/captain/team/${teamId}`} aria-label="SIXFL captain home" className="shrink-0">
          <img src="/logo2.png" alt="SIXFL" className="h-7 w-auto object-contain" />
        </Link>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-black tracking-tight text-white">{title}</div>
          {title !== "Home" ? (
            <div className="mt-0.5 truncate text-[10px] text-white/35">{teamName}</div>
          ) : null}
        </div>

        <Link
          href={`/captain/team/${teamId}/more`}
          aria-label="Open captain app menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20 active:bg-white/[0.06]"
        >
          {teamLogoUrl ? (
            <img src={teamLogoUrl} alt={`${teamName} badge`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-black text-emerald-100">{initials(teamName)}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
