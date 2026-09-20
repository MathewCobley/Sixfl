"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  HomeIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

type CaptainPwaBottomNavProps = {
  teamId: string;
  squadHref: string;
};

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  unreadCount?: number;
  icon: typeof HomeIcon;
};

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function CaptainPwaBottomNav({
  teamId,
  squadHref,
}: CaptainPwaBottomNavProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      href: `/captain/team/${teamId}`,
      label: "Home",
      exact: true,
      icon: HomeIcon,
    },
    {
      href: `/captain/team/${teamId}/fixtures`,
      label: "Fixtures",
      icon: CalendarDaysIcon,
    },
    {
      href: squadHref,
      label: "Squad",
      icon: UsersIcon,
    },
    {
      href: `/captain/team/${teamId}/player-payments`,
      label: "Payments",
      icon: BanknotesIcon,
    },
  ];

  return (
    <nav
      aria-label="Captain quick navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#07130f]/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
    >
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-0.5 px-1 pt-1.5">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={
                item.unreadCount && item.unreadCount > 0
                  ? `${item.label}, ${item.unreadCount} unread`
                  : item.label
              }
              className={[
                "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition",
                active
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "text-white/55 active:bg-white/[0.06] active:text-white",
              ].join(" ")}
            >
              <span className="relative">
                <Icon aria-hidden="true" className="h-5 w-5" />
                {item.unreadCount && item.unreadCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black leading-none text-black"
                  >
                    {item.unreadCount > 99 ? "99+" : item.unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
