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
    tint: "emerald",
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
    tint: "sky",
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
        description: "Linked accounts",
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
    tint: "amber",
    items: [
      {
        name: "Night board",
        href: "/admin/night-board",
        icon: CalendarDaysIcon,
        description: "Pitch, refs, cashup",
      },
      {
        name: "Fixtures",
        href: "/admin/fixtures",
        icon: CalendarDaysIcon,
        description: "Schedule/results",
      },
      {
        name: "Bulk generator",
        href: "/admin/fixtures/generate",
        icon: CalendarDaysIcon,
        description: "Draft fixtures",
      },
      {
        name: "Replace team",
        href: "/admin/fixtures/replace-team",
        icon: UserGroupIcon,
        description: "Swap fixtures",
      },
      {
        name: "Fixture backfill",
        href: "/admin/fixtures/backfill",
        icon: WrenchScrewdriverIcon,
        description: "Fees/referees",
      },
      {
        name: "Late fees",
        href: "/admin/fixtures/late-fees",
        icon: ExclamationTriangleIcon,
        description: "72h review",
      },
      {
        name: "Result disputes",
        href: "/admin/results",
        icon: ExclamationTriangleIcon,
        description: "Captain issues",
      },
    ],
  },
  {
    title: "Referees",
    tint: "violet",
    items: [
      {
        name: "Referees",
        href: "/admin/referees",
        icon: ShieldCheckIcon,
        description: "Officials",
      },
      {
        name: "Referee nights",
        href: "/admin/referee-nights",
        icon: CalendarDaysIcon,
        description: "Night fees",
      },
      {
        name: "Availability",
        href: "/admin/referee-availability",
        icon: CalendarDaysIcon,
        description: "Monthly cover",
      },
    ],
  },
  {
    title: "Payments",
    tint: "rose",
    items: [
      {
        name: "Payments",
        href: "/admin/payments",
        icon: DocumentTextIcon,
        description: "Charges/payments",
      },
      {
        name: "Subscriptions",
        href: "/admin/payments/subscriptions",
        icon: CreditCardIcon,
        description: "Stripe billing",
      },
    ],
  },
  {
    title: "Recruitment",
    tint: "lime",
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
        description: "Player pipeline",
      },
      {
        name: "Prospect teams",
        href: "/admin/team-prospects",
        icon: UserGroupIcon,
        description: "Team enquiries",
      },
    ],
  },
  {
    title: "Comms & marketing",
    tint: "cyan",
    items: [
      {
        name: "Communications",
        href: "/admin/messaging",
        icon: DocumentTextIcon,
        description: "Email/SMS",
      },
      {
        name: "Templates",
        href: "/admin/templates",
        icon: DocumentTextIcon,
        description: "Message copy",
      },
      {
        name: "Queue",
        href: "/admin/queue",
        icon: Cog6ToothIcon,
        description: "Dispatches",
      },
      {
        name: "Social",
        href: "/admin/social",
        icon: PhotoIcon,
        description: "Drafts/publishing",
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

function groupTintClasses(tint: string) {
  switch (tint) {
    case "sky":
      return "border-sky-400/15 bg-sky-400/[0.035]";
    case "amber":
      return "border-amber-400/15 bg-amber-400/[0.035]";
    case "violet":
      return "border-violet-400/15 bg-violet-400/[0.035]";
    case "rose":
      return "border-rose-400/15 bg-rose-400/[0.035]";
    case "lime":
      return "border-lime-400/15 bg-lime-400/[0.035]";
    case "cyan":
      return "border-cyan-400/15 bg-cyan-400/[0.035]";
    default:
      return "border-emerald-400/15 bg-emerald-400/[0.035]";
  }
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
        <div className="border-b border-white/10 px-4 py-4 xl:px-3 xl:py-3 2xl:px-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35 xl:text-[10px]">
            Admin console
          </div>

          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 xl:mt-2 xl:rounded-xl xl:p-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white xl:text-[13px]">
                  {name?.trim() || "Admin"}
                </div>
                <div className="mt-1 truncate text-xs text-white/45 xl:text-[11px]">
                  {email?.trim() || "SIXFL operations"}
                </div>
              </div>

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 xl:h-8 xl:w-8 xl:rounded-xl">
                <Cog6ToothIcon className="h-4 w-4 text-emerald-300" />
              </div>
            </div>
          </div>
        </div>

        <nav className="h-[calc(100%-7.7rem)] overflow-y-auto px-3 py-3 xl:h-[calc(100%-7rem)] 2xl:h-[calc(100%-7.4rem)]">
          <div className="grid grid-cols-2 gap-3">
            {navigationGroups.map((group) => (
              <div
                key={group.title}
                className={`rounded-2xl border p-2.5 ${groupTintClasses(group.tint)}`}
              >
                <div className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  {group.title}
                </div>
                <div className="grid gap-1.5">
                  {group.items.map((item) => {
                    const isActive = activeHref === item.href;
                    const Icon = item.icon;
                    const showUnreadBadge = item.href === "/admin/messaging" && unreadMessagingCount > 0;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group flex items-center gap-2 rounded-xl border px-2 py-2 transition ${
                          isActive
                            ? "border-emerald-400/30 bg-emerald-400/12 text-white shadow-[0_0_24px_rgba(16,185,129,0.12)]"
                            : "border-white/8 bg-black/18 text-white/65 hover:border-white/18 hover:bg-white/[0.045] hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                            isActive
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                              : "border-white/10 bg-black/25 text-white/45 group-hover:text-white/75"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-[12px] font-semibold leading-tight">
                            {item.name}
                            {showUnreadBadge ? (
                              <span className="rounded-full bg-emerald-400 px-1.5 py-0.5 text-[9px] font-bold text-black">
                                {unreadMessagingCount}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] leading-tight text-white/38">
                            {item.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
