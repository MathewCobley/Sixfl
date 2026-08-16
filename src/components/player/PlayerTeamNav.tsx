"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function addPreviewMembershipId(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;

  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("previewMembershipId", previewMembershipId);
  const nextQuery = params.toString();

  return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}

const tabs = (teamId: string, previewMembershipId: string | null) => [
  {
    href: addPreviewMembershipId(`/player/team/${teamId}`, previewMembershipId),
    label: "Overview",
    exact: true,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/stats`, previewMembershipId),
    label: "Player stats",
    exact: false,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/availability`, previewMembershipId),
    label: "Availability",
    exact: false,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/league-results`, previewMembershipId),
    label: "League results",
    exact: false,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/tv`, previewMembershipId),
    label: "SIXFL TV",
    exact: false,
  },
  {
    href: `/goal-of-the-week?from=player&teamId=${encodeURIComponent(teamId)}${
      previewMembershipId
        ? `&previewMembershipId=${encodeURIComponent(previewMembershipId)}`
        : ""
    }`,
    label: "Goal of the Week",
    exact: false,
  },
  {
    href: "/player/referrals",
    label: "Refer a team · £75",
    exact: false,
  },
];

export default function PlayerTeamNav({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previewMembershipId = searchParams.get("previewMembershipId")?.trim() || null;

  return (
    <nav
      aria-label="Player team sections"
      className="mx-auto mt-4 flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-1"
    >
      {tabs(teamId, previewMembershipId).map((tab) => {
        const hrefPath = tab.href.split("?")[0] ?? tab.href;
        const active = tab.exact
          ? pathname === hrefPath || pathname === `${hrefPath}/`
          : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);

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
