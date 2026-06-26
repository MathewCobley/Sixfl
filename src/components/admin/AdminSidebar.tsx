// ========================================
// File: src/components/admin/AdminSidebar.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PhotoIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

type AdminSidebarProps = {
  name?: string | null;
  email?: string | null;
  unreadMessagingCount?: number;
};

const navigation = [
  {
    name: "Overview",
    href: "/admin",
    icon: ShieldCheckIcon,
    exact: true,
    description: "Admin dashboard",
  },
  {
    name: "Search",
    href: "/admin/search",
    icon: MagnifyingGlassIcon,
    description: "Find by mobile or email",
  },
  {
    name: "Teams",
    href: "/admin/teams",
    icon: UserGroupIcon,
    description: "Squads and captains",
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: UsersIcon,
    description: "Names and linked accounts",
  },
  {
    name: "Leagues",
    href: "/admin/leagues",
    icon: TrophyIcon,
    description: "League setup",
  },
  {
    name: "Venues",
    href: "/admin/venues",
    icon: MapPinIcon,
    description: "Match locations",
  },
  {
    name: "Fixtures",
    href: "/admin/fixtures",
    icon: CalendarDaysIcon,
    description: "Schedule and results",
  },
  {
    name: "Bulk Fixture Generator",
    href: "/admin/fixtures/generate",
    icon: CalendarDaysIcon,
    description: "Draft fixtures by pitch",
  },
  {
    name: "Late Fees",
    href: "/admin/fixtures/late-fees",
    icon: ExclamationTriangleIcon,
    description: "72h confirmation review",
  },
  {
    name: "Social",
    href: "/admin/social",
    icon: PhotoIcon,
    description: "Drafts and publishing",
  },
  {
    name: "Result Disputes",
    href: "/admin/results",
    icon: ExclamationTriangleIcon,
    description: "Captain-raised issues",
  },
  {
    name: "Payments",
    href: "/admin/payments",
    icon: DocumentTextIcon,
    description: "Charges and payments",
  },
  {
    name: "Subscriptions",
    href: "/admin/payments/subscriptions",
    icon: CreditCardIcon,
    description: "Recurring Stripe billing",
  },
  {
    name: "Referees",
    href: "/admin/referees",
    icon: ShieldCheckIcon,
    description: "Officials and assignments",
  },
  {
    name: "Referee Nights",
    href: "/admin/referee-nights",
    icon: CalendarDaysIcon,
    description: "Night fees and cashups",
  },
  {
    name: "Leads",
    href: "/admin/leads",
    icon: UsersIcon,
    description: "Inbound enquiries",
  },
  {
    name: "Player Prospects",
    href: "/admin/player-prospects",
    icon: UsersIcon,
    description: "Individual player pipeline",
  },
  {
    name: "Prospect Teams",
    href: "/admin/team-prospects",
    icon: UserGroupIcon,
    description: "Team enquiries and dropouts",
  },
  {
    name: "Communications",
    href: "/admin/messaging",
    icon: DocumentTextIcon,
    description: "Email, SMS and history",
  },
  {
    name: "Queue",
    href: "/admin/queue",
    icon: Cog6ToothIcon,
    description: "SMS and email dispatches",
  },
  {
    name: "Templates",
    href: "/admin/templates",
    icon: DocumentTextIcon,
    description: "Email and SMS messaging",
  },
];

function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveHref(pathname: string) {
  return navigation
    .filter((item) => isActivePath(pathname, item.href, item.exact))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export default function AdminSidebar({
  name,
  email,
  unreadMessagingCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <aside className="fixed bottom-4 top-24 w-[34rem] 2xl:w-[38rem]">
      <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-4 py-5 xl:px-3 xl:py-3 2xl:px-4 2xl:py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35 xl:text-[10px]">
            Admin console
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 xl:mt-2 xl:rounded-xl xl:p-2.5 2xl:mt-3 2xl:p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white xl:text-[13px]">
                  {name?.trim() || "Admin"}
                </div>
                <div className="mt-1 truncate text-sm text-white/45 xl:text-[11px]">
                  {email?.trim() || "SIXFL operations"}
                </div>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 xl:h-8 xl:w-8 xl:rounded-xl">
                <Cog6ToothIcon className="h-5 w-5 text-emerald-300 xl:h-4 xl:w-4" />
              </div>
            </div>
          </div>
        </div>

        <nav className="grid max-h-[calc(100dvh-18rem)] gap-2 overflow-y-auto p-3 sixfl-mobile-scroll xl:max-h-none xl:gap-1.5 xl:overflow-visible xl:p-2 2xl:gap-2 2xl:p-3">
          {navigation.map((item) => {
            const active = activeHref === item.href;
            const Icon = item.icon;
            const unreadCount =
              item.name === "Communications" ? unreadMessagingCount : 0;
            const description =
              item.name === "Communications" && unreadCount > 0
                ? `${unreadCount} unread thread${unreadCount === 1 ? "" : "s"}`
                : item.description;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "group flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 transition xl:min-h-0 xl:gap-2 xl:rounded-xl xl:px-2.5 xl:py-2 2xl:gap-3 2xl:rounded-2xl 2xl:px-3 2xl:py-2.5",
                  active
                    ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-white/8 bg-white/[0.02] text-white/75 hover:border-white/15 hover:bg-white/[0.05] hover:text-white",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition xl:h-7 xl:w-7 xl:rounded-lg 2xl:h-8 2xl:w-8 2xl:rounded-xl",
                    active
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-black/30 text-white/55 group-hover:text-white/80",
                  ].join(" ")}
                >
                  <Icon className="h-4.5 w-4.5 xl:h-4 xl:w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold xl:text-[13px] 2xl:text-sm">
                      {item.name}
                    </div>

                    {unreadCount > 0 ? (
                      <span className="inline-flex min-w-[1.35rem] shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 truncate text-[11px] text-white/35 xl:text-[10px] 2xl:text-[11px]">
                    {description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
