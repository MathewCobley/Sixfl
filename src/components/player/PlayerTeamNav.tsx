"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = (teamId: string) => [
  { href: `/player/team/${teamId}`, label: "Overview", exact: true },
  { href: `/player/team/${teamId}/stats`, label: "Player stats", exact: false },
  { href: `/player/team/${teamId}/availability`, label: "Availability", exact: false },
  { href: `/player/team/${teamId}/tv`, label: "SIXFL TV", exact: false },
];

export default function PlayerTeamNav({ teamId }: { teamId: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Player team sections"
      className="mx-auto mt-4 flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-1"
    >
      {tabs(teamId).map((tab) => {
        const active = tab.exact
          ? pathname === tab.href || pathname === `${tab.href}/`
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
              active
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                : "border-white/10 bg-black/20 text-white/60 hover:border-white/20 hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
