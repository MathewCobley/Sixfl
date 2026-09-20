"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  EllipsisHorizontalCircleIcon,
  HomeIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";

type PlayerNavTab = {
  href: string;
  label: string;
  exact: boolean;
  unreadCount?: number;
};

type PlayerAppTab = PlayerNavTab & {
  icon: typeof HomeIcon;
};

function addPreviewMembershipId(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;

  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("previewMembershipId", previewMembershipId);
  const nextQuery = params.toString();

  return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}

function isActivePath(pathname: string, tab: PlayerNavTab) {
  const hrefPath = tab.href.split("?")[0] ?? tab.href;
  return tab.exact
    ? pathname === hrefPath || pathname === `${hrefPath}/`
    : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

const tabs = (
  teamId: string,
  previewMembershipId: string | null,
  unreadChatCount: number,
  showTeamChat: boolean,
): PlayerNavTab[] => [
  {
    href: addPreviewMembershipId(`/player/team/${teamId}`, previewMembershipId),
    label: "Overview",
    exact: true,
  },
  ...(showTeamChat
    ? [{
        href: addPreviewMembershipId(`/player/team/${teamId}/chat`, previewMembershipId),
        label: "Chat",
        exact: false,
        unreadCount: unreadChatCount,
      }]
    : []),
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

const appTabs = (
  teamId: string,
  previewMembershipId: string | null,
  unreadChatCount: number,
  showTeamChat: boolean,
): PlayerAppTab[] => [
  {
    href: addPreviewMembershipId(`/player/team/${teamId}`, previewMembershipId),
    label: "Home",
    exact: true,
    icon: HomeIcon,
  },
  {
    href: addPreviewMembershipId(
      `/player/team/${teamId}/availability`,
      previewMembershipId,
    ),
    label: "Fixtures",
    exact: false,
    icon: CalendarDaysIcon,
  },
  ...(showTeamChat
    ? [{
        href: addPreviewMembershipId(`/player/team/${teamId}/chat`, previewMembershipId),
        label: "Chat",
        exact: false,
        unreadCount: unreadChatCount,
        icon: ChatBubbleLeftRightIcon,
      }]
    : [{
        href: addPreviewMembershipId(`/player/team/${teamId}/stats`, previewMembershipId),
        label: "Stats",
        exact: false,
        icon: ChartBarSquareIcon,
      }]),
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/tv`, previewMembershipId),
    label: "TV",
    exact: false,
    icon: PlayCircleIcon,
  },
  {
    href: addPreviewMembershipId(`/player/team/${teamId}/more`, previewMembershipId),
    label: "More",
    exact: false,
    icon: EllipsisHorizontalCircleIcon,
  },
];

export default function PlayerTeamNav({
  teamId,
  unreadChatCount = 0,
  showTeamChat = false,
}: {
  teamId: string;
  unreadChatCount?: number;
  showTeamChat?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previewMembershipId = searchParams.get("previewMembershipId")?.trim() || null;

  return (
    <>
      <style>{`
        .player-app-bottom-nav {
          display: none;
        }

        body:has(.player-pwa-mode) .player-web-nav {
          display: none !important;
        }

        body:has(.player-pwa-mode) .player-app-bottom-nav {
          display: block;
        }
      `}</style>

      <nav
        aria-label="Player team sections"
        className="player-web-nav mx-auto mt-4 flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs(teamId, previewMembershipId, unreadChatCount, showTeamChat).map((tab) => {
          const active = isActivePath(pathname, tab);

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

      <nav
        aria-label="Player app navigation"
        className="player-app-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-[#081510]/95 shadow-[0_-14px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 px-1 pt-1.5">
          {appTabs(teamId, previewMembershipId, unreadChatCount, showTeamChat).map((tab) => {
            const active = isActivePath(pathname, tab);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-bold transition",
                  active
                    ? "text-emerald-300"
                    : "text-white/40 active:bg-white/[0.05] active:text-white/70",
                ].join(" ")}
              >
                <span className="relative">
                  <Icon
                    aria-hidden="true"
                    className={active ? "h-5 w-5 stroke-[2.2]" : "h-5 w-5"}
                  />
                  {(tab.unreadCount ?? 0) > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2.5 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black leading-none text-black"
                    >
                      {(tab.unreadCount ?? 0) > 99 ? "99+" : tab.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
