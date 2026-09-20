"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type PlayerNavTab = {
  href: string;
  label: string;
  exact: boolean;
  unreadCount?: number;
};

function addPreviewMembershipId(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;

  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("previewMembershipId", previewMembershipId);
  const nextQuery = params.toString();

  return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}

const tabs = (
  teamId: string,
  previewMembershipId: string | null,
  unreadChatCount: number,
): PlayerNavTab[] => [
  {
    href: addPreviewMembershipId(`/player/team/${teamId}`, previewMembershipId),
    label: "Overview",
    exact: true,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/chat`, previewMembershipId),
    label: "Chat",
    exact: false,
    unreadCount: unreadChatCount,
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
    href: `/goal-of-the-month?from=player&teamId=${encodeURIComponent(teamId)}${
      previewMembershipId
        ? `&previewMembershipId=${encodeURIComponent(previewMembershipId)}`
        : ""
    }`,
    label: "Goal of the Month",
    exact: false,
  },
  {
    href: "/player/referrals",
    label: "Refer a team · £75",
    exact: false,
  },
];

export default function PlayerTeamNav({
  teamId,
  unreadChatCount = 0,
}: {
  teamId: string;
  unreadChatCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previewMembershipId = searchParams.get("previewMembershipId")?.trim() || null;

  return (
    <nav
      aria-label="Player team sections"
      className="mx-auto mt-4 flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs(teamId, previewMembershipId, unreadChatCount).map((tab) => {
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
            <span>{tab.label}</span>
            {(tab.unreadCount ?? 0) > 0 ? (
              <span
                aria-hidden="true"
                className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-black leading-none text-black"
              >
                {(tab.unreadCount ?? 0) > 99 ? "99+" : tab.unreadCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
