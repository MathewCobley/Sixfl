"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  EllipsisHorizontalCircleIcon,
  HomeIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

export type PwaAppNavIcon =
  | "home"
  | "teams"
  | "fixtures"
  | "inbox"
  | "more";

export type PwaAppNavItem = {
  href: string;
  label: string;
  icon: PwaAppNavIcon;
  exact?: boolean;
  fallback?: boolean;
  badgeCount?: number;
};

type PwaAppFrameProps = {
  title: string;
  dateLabel: string;
  profileInitials: string;
  profileHref: string;
  notificationHref: string;
  notificationCount?: number;
  navItems: PwaAppNavItem[];
};

const iconMap = {
  home: HomeIcon,
  teams: UserGroupIcon,
  fixtures: CalendarDaysIcon,
  inbox: ChatBubbleLeftRightIcon,
  more: EllipsisHorizontalCircleIcon,
} satisfies Record<PwaAppNavIcon, typeof HomeIcon>;

function isNavItemActive(pathname: string, item: PwaAppNavItem) {
  if (item.fallback) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isPwaPreviewFrame() {
  try {
    return (
      window.self !== window.top &&
      window.parent.location.origin === window.location.origin &&
      window.parent.location.pathname === "/admin/pwa"
    );
  } catch {
    return false;
  }
}

export default function PwaAppFrame({
  title,
  dateLabel,
  profileInitials,
  profileHref,
  notificationHref,
  notificationCount = 0,
  navItems,
}: PwaAppFrameProps) {
  const pathname = usePathname();
  const [forcedAppMode, setForcedAppMode] = useState(false);

  useEffect(() => {
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    setForcedAppMode(iosStandalone || isPwaPreviewFrame());
  }, []);

  const activeHref = useMemo(() => {
    const active = navItems.find((item) => isNavItemActive(pathname, item));
    if (active) return active.href;
    return navItems.find((item) => item.fallback)?.href ?? null;
  }, [navItems, pathname]);

  return (
    <div className={forcedAppMode ? "pwa-app-forced" : "pwa-app-controller"}>
      <style>{`
        .pwa-app-header,
        .pwa-app-bottom-nav,
        .pwa-app-home {
          display: none;
        }

        @media (display-mode: standalone) {
          .pwa-web-chrome,
          .pwa-web-home {
            display: none !important;
          }

          .pwa-app-header {
            display: flex;
          }

          .pwa-app-bottom-nav,
          .pwa-app-home {
            display: block;
          }

          .pwa-app-content-shell {
            padding: 0 0 calc(5rem + env(safe-area-inset-bottom)) !important;
            gap: 0 !important;
          }

          .pwa-app-main {
            padding-top: 0 !important;
          }
        }

        body:has(.pwa-app-forced) .pwa-web-chrome,
        body:has(.pwa-app-forced) .pwa-web-home {
          display: none !important;
        }

        body:has(.pwa-app-forced) .pwa-app-header {
          display: flex;
        }

        body:has(.pwa-app-forced) .pwa-app-bottom-nav,
        body:has(.pwa-app-forced) .pwa-app-home {
          display: block;
        }

        body:has(.pwa-app-forced) .pwa-app-content-shell {
          padding: 0 0 5rem !important;
          gap: 0 !important;
        }

        body:has(.pwa-app-forced) .pwa-app-main {
          padding-top: 0 !important;
        }
      `}</style>

      <header
        className="pwa-app-header sticky top-0 z-50 items-center justify-between border-b border-white/10 bg-[#050807]/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.8rem)] backdrop-blur-xl"
      >
        <div className="min-w-0">
          <Link href="/admin" className="inline-flex items-center">
            <Image
              src="/logo2.png"
              alt="SIXFL"
              width={120}
              height={32}
              priority
              className="h-6 w-auto object-contain"
            />
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
              {title}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35">
              {dateLabel}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={notificationHref}
            aria-label={
              notificationCount > 0
                ? `Open inbox, ${notificationCount} unread`
                : "Open inbox"
            }
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition active:bg-white/[0.08]"
          >
            <BellIcon aria-hidden="true" className="h-5 w-5" />
            {notificationCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-black leading-none text-black"
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
          </Link>

          <Link
            href={profileHref}
            aria-label="Open admin menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-sm font-black text-emerald-100 transition active:bg-emerald-500/20"
          >
            {profileInitials}
          </Link>
        </div>
      </header>

      <nav
        aria-label="SIXFL app navigation"
        className="pwa-app-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050807]/97 px-1.5 pt-1.5 shadow-[0_-16px_48px_rgba(0,0,0,0.48)] backdrop-blur-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-0.5">
          {navItems.map((item) => {
            const Icon = iconMap[item.icon];
            const active = activeHref === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  item.badgeCount && item.badgeCount > 0
                    ? `${item.label}, ${item.badgeCount} unread`
                    : item.label
                }
                className={[
                  "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition",
                  active
                    ? "bg-emerald-400/12 text-emerald-200"
                    : "text-white/45 active:bg-white/[0.05] active:text-white",
                ].join(" ")}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  {item.badgeCount && item.badgeCount > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2.5 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black leading-none text-black"
                    >
                      {item.badgeCount > 99 ? "99+" : item.badgeCount}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
