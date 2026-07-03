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
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

type AdminSidebarProps = {
  name?: string | null;
  email?: string | null;
  unreadMessagingCount?: number;
};

const navigationGroups = [
  {
    title: "Start",
    items: [
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
    ],
  },
  {
    title: "League setup",
    items: [
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
    ],
  },
  {
    title: "Fixtures",
    items: [
      {
        name: "Night board",
        href: "/admin/night-board",
        icon: CalendarDaysIcon,
        description: "Pitch, refs and cashup",
      },
      {
        name: "Fixtures",
        href: "/admin/fixtures",
        icon: CalendarDaysIcon,
        description: "Schedule and results",
      },
      {
        name: "Bulk generator",
        href: "/admin/fixtures/generate",
        icon: CalendarDaysIcon,
        description: "Draft fixtures by pitch",
      },
      {
        name: "Replace team",
        href: "/admin/fixtures/replace-team",
        icon: UserGroupIcon,
        description: "Swap future fixtures",
      },
      {
        name: "Fixture backfill",
        href: "/admin/fixtures/backfill",
        icon: WrenchScrewdriverIcon,
        description: "Fees and referees",
      },
      {
        name: "Late fees",
        href: "/admin/fixtures/late-fees",
        icon: ExclamationTriangleIcon,
        description: "72h confirmation review",
      },
      {
        name: "Result disputes",
        href: "/admin/results",
        icon: ExclamationTriangleIcon,
        description: "Captain-raised issues",
      },
    ],
  },
  {
    title: "Referees",
    items: [
      {
        name: "Referees",
        href: "/admin/referees",
        icon: ShieldCheckIcon,
        description: "Officials and assignments",
      },
      {
        name: "Referee nights",
        href: "/admin/referee-nights",
        icon: CalendarDaysIcon,
        description: "Night fees and cashups",
      },
      {
        name: "Availability",
        href: "/admin/referee-availability",
        icon: CalendarDaysIcon,
        description: "Monthly referee cover",
      },
    ],
  },
  {
    title: "Payments",
    items: [
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
    ],
  },
  {
    title: "Recruitment",
    items: [
      {
        name: "Leads",
        href: "/admin/leads",
        icon: UsersIcon,
        description: "Inbound enquiries",
      },
      {
        name: "Player prospects",
        href: "/admin/player-prospects",
        icon: UsersIcon,
        description: "Individual player pipeline",
      },
      {
        name: "Prospect teams",
        href: "/admin/team-prospects",
        icon: UserGroupIcon,
        description: "Team enquiries and dropouts",
      },
    ],
  },
  {
    title: "Comms & marketing",
    items: [
      {
        name: "Communications",
        href: "/admin/messaging",
        icon: DocumentTextIcon,
        description: "Email, SMS and history",
      },
      {
        name: "Templates",
        href: "/admin/templates",
        icon: DocumentTextIcon,
        description: "Email and SMS messaging",
      },
      {
        name: "Queue",
        href: "/admin/queue",
        icon: Cog6ToothIcon,
        description: "SMS and email dispatches",
      },
      {
        name: "Social",
        href: "/admin/social",
        icon: PhotoIcon,
        description: "Drafts and publishing",
      },
    ],
  },
];

const navigation = navigationGroups.flatMap((group) => group.items);

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

        <nav className="h-[calc(100%-8.8rem)] space-y-6 overflow-y-auto px-4 py-5 xl:h-[calc(100%-7.2rem)] xl:space-y-4 xl:px-3 xl:py-3 2xl:h-[calc(100%-8rem)] 2xl:space-y-5 2xl:px-4 2xl:py-4">
          {navigationGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30 xl:mb-2 xl:text-[9px]">
                {group.title}
              </div>
              <div className="grid gap-2 xl:gap-1.5">
                {group.items.map((item) => {
                  const isActive = activeHref === item.href;
                  const Icon = item.icon;
                  const showUnreadBadge = item.href === "/admin/messaging" && unreadMessagingCount > 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 transition xl:rounded-xl xl:px-2.5 xl:py-2 2xl:px-3 2xl:py-2.5 ${
                        isActive
                          ? "border-emerald-400/25 bg-emerald-400/10 text-white shadow-[0_0_30px_rgba(16,185,129,0.08)]"
                          : "border-white/10 bg-white/[0.02] text-white/65 hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition xl:h-8 xl:w-8 xl:rounded-xl ${
                          isActive
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-black/20 text-white/45 group-hover:text-white/75"
                        }`}
                      >
                        <Icon className="h-5 w-5 xl:h-4 xl:w-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate text-sm font-semibold xl:text-[13px]">
                          {item.name}
                          {showUnreadBadge ? (
                            <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black">
                              {unreadMessagingCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/40 xl:text-[11px]">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
