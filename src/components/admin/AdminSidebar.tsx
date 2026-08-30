// ========================================
// File: src/components/admin/AdminSidebar.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PhotoIcon,
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
  openDisputeCount?: number;
};

const navigationGroups = [
  {
    title: "Start",
    tint: "emerald",
    column: 1,
    items: [
      {
        name: "Overview",
        href: "/admin",
        icon: ShieldCheckIcon,
        exact: true,
        description: "Dashboard",
      },
      {
        name: "Search",
        href: "/admin/search",
        icon: MagnifyingGlassIcon,
        description: "Find people",
      },
    ],
  },
  {
    title: "League setup",
    tint: "sky",
    column: 2,
    items: [
      {
        name: "Leagues",
        href: "/admin/leagues",
        icon: TrophyIcon,
        description: "Setup",
      },
      {
        name: "Teams",
        href: "/admin/teams",
        icon: UserGroupIcon,
        description: "Squads",
      },
      {
        name: "Tables",
        href: "/admin/league-tables",
        icon: TrophyIcon,
        description: "Standings",
      },
      {
        name: "Venues",
        href: "/admin/venues",
        icon: MapPinIcon,
        description: "Locations",
      },
      {
        name: "Kits",
        href: "/admin/kits",
        icon: PhotoIcon,
        description: "Orders",
      },
    ],
  },
  {
    title: "Comms & media",
    tint: "cyan",
    column: 3,
    items: [
      {
        name: "Comms",
        href: "/admin/messaging",
        icon: DocumentTextIcon,
        description: "Email/SMS",
      },
      {
        name: "Templates",
        href: "/admin/templates",
        icon: DocumentTextIcon,
        description: "Content",
      },
      {
        name: "Team messages",
        href: "/admin/team-messages",
        icon: DocumentTextIcon,
        description: "Captains",
      },
      {
        name: "Social posts",
        href: "/admin/social",
        icon: PhotoIcon,
        description: "Cards",
      },
      {
        name: "SIXFL TV",
        href: "/admin/sixfl-tv",
        icon: PhotoIcon,
        description: "Recordings",
      },
      {
        name: "Goal of the week",
        href: "/admin/sixfl-tv/goal-of-week",
        icon: TrophyIcon,
        description: "Nominations/votes",
      },
      {
        name: "Polls",
        href: "/admin/polls",
        icon: DocumentTextIcon,
        description: "Votes",
      },
    ],
  },
  {
    title: "Matchday",
    tint: "amber",
    column: 1,
    items: [
      {
        name: "Night board",
        href: "/admin/night-board",
        icon: CalendarDaysIcon,
        description: "Refs/cashup",
      },
      {
        name: "Fixtures",
        href: "/admin/fixtures",
        icon: CalendarDaysIcon,
        description: "Schedule/results",
      },
      {
        name: "Team issues",
        href: "/admin/fixtures/unavailable",
        icon: ExclamationTriangleIcon,
        description: "Availability",
      },
      {
        name: "Disputes",
        href: "/admin/results",
        icon: ExclamationTriangleIcon,
        description: "Results/issues",
      },
    ],
  },
  {
    title: "Fixture tools",
    tint: "amber",
    column: 2,
    items: [
      {
        name: "Generate fixtures",
        href: "/admin/fixtures/generate",
        icon: CalendarDaysIcon,
        description: "Create schedule",
      },
      {
        name: "Drop team",
        href: "/admin/fixtures/drop-team",
        icon: ExclamationTriangleIcon,
        description: "Draft removal",
      },
      {
        name: "Replace team",
        href: "/admin/fixtures/replace-team",
        icon: UserGroupIcon,
        description: "Swap",
      },
      {
        name: "Carry fees",
        href: "/admin/fixtures/carry-forward-payments",
        icon: CreditCardIcon,
        description: "Postponed",
      },
      {
        name: "Backfill",
        href: "/admin/fixtures/backfill",
        icon: WrenchScrewdriverIcon,
        description: "Fees/refs",
      },
    ],
  },
  {
    title: "Referees",
    tint: "violet",
    column: 3,
    items: [
      {
        name: "Referees",
        href: "/admin/referees",
        icon: ShieldCheckIcon,
        description: "Officials",
      },
      {
        name: "Referee controls",
        href: "/admin/referee-nights",
        icon: CalendarDaysIcon,
        description: "Nights/fees",
      },
      {
        name: "Availability",
        href: "/admin/referee-availability",
        icon: CalendarDaysIcon,
        description: "Cover",
      },
    ],
  },
  {
    title: "Recruitment",
    tint: "lime",
    column: 1,
    items: [
      {
        name: "Expansion",
        href: "/admin/expansion-leads",
        icon: MapPinIcon,
        description: "New areas",
      },
      {
        name: "Leads",
        href: "/admin/leads",
        icon: UsersIcon,
        description: "Inbound",
      },
      {
        name: "Team referrals",
        href: "/admin/referrals",
        icon: CreditCardIcon,
        description: "£75 rewards",
      },
      {
        name: "Player pool",
        href: "/admin/player-pool",
        icon: UserGroupIcon,
        description: "Available players",
      },
      {
        name: "Players",
        href: "/admin/player-prospects",
        icon: UsersIcon,
        description: "Pipeline",
      },
      {
        name: "Prospect teams",
        href: "/admin/team-prospects",
        icon: UserGroupIcon,
        description: "Teams",
      },
    ],
  },
  {
    title: "People & access",
    tint: "teal",
    column: 1,
    items: [
      {
        name: "Users",
        href: "/admin/users",
        icon: UsersIcon,
        description: "Accounts",
      },
      {
        name: "Identity audit",
        href: "/admin/users/identity-audit",
        icon: ExclamationTriangleIcon,
        description: "Missing emails",
      },
      {
        name: "Sign-in activity",
        href: "/admin/sign-in-activity",
        icon: ShieldCheckIcon,
        description: "Magic-link use",
      },
      {
        name: "Player data health",
        href: "/admin/players/data-health",
        icon: WrenchScrewdriverIcon,
        description: "Player cleanup",
      },
    ],
  },
  {
    title: "System tools",
    tint: "slate",
    column: 2,
    items: [
      {
        name: "AI predictor",
        href: "/admin/ai-predictor",
        icon: TrophyIcon,
        description: "Weekly accuracy",
      },
      {
        name: "Predictor backtest",
        href: "/admin/ai-predictor/backtest",
        icon: TrophyIcon,
        description: "Historical test",
      },
      {
        name: "League audit",
        href: "/admin/audits/league-structure",
        icon: WrenchScrewdriverIcon,
        description: "Structure",
      },
      {
        name: "Email audit",
        href: "/admin/email-audit",
        icon: MagnifyingGlassIcon,
        description: "Address counts",
      },
      {
        name: "Queue",
        href: "/admin/queue",
        icon: Cog6ToothIcon,
        description: "Dispatches",
      },
      {
        name: "Delivery issues",
        href: "/admin/delivery-issues",
        icon: ExclamationTriangleIcon,
        description: "Bounces",
      },
    ],
  },
  {
    title: "Payments",
    tint: "rose",
    column: 3,
    items: [
      {
        name: "Payments",
        href: "/admin/payments",
        icon: DocumentTextIcon,
        description: "Charges",
      },
      {
        name: "Late fees",
        href: "/admin/fixtures/late-fees",
        icon: ExclamationTriangleIcon,
        description: "Overdue review",
      },
      {
        name: "Team credits",
        href: "/admin/payments/team-credits",
        icon: CreditCardIcon,
        description: "Credit",
      },
      {
        name: "Saved cards",
        href: "/admin/payments/subscriptions",
        icon: CreditCardIcon,
        description: "Matchday",
      },
      {
        name: "Stripe audit",
        href: "/admin/payments/stripe-reconciliation",
        icon: CreditCardIcon,
        description: "Verify payments",
      },
    ],
  },
];

const navigationColumns = [1, 2, 3].map((column) =>
  navigationGroups.filter((group) => group.column === column),
);

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
    case "teal":
      return "border-teal-400/15 bg-teal-400/[0.035]";
    case "slate":
      return "border-slate-400/15 bg-slate-400/[0.035]";
    default:
      return "border-emerald-400/15 bg-emerald-400/[0.035]";
  }
}

function navItemClasses(active: boolean) {
  return [
    "group flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 transition",
    active
      ? "border-emerald-400/30 bg-emerald-400/12 text-white shadow-[0_0_18px_rgba(16,185,129,0.12)]"
      : "border-white/8 bg-black/18 text-white/65 hover:border-white/18 hover:bg-white/[0.045] hover:text-white",
  ].join(" ");
}

export default function AdminSidebar({
  name,
  email,
  unreadMessagingCount = 0,
  openDisputeCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <aside className="fixed bottom-2 top-20 w-[34rem] 2xl:w-[38rem]">
      <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-2 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/90">
                SIXFL
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">
                Admin Console
              </div>
              <div className="truncate text-[9px] text-white/45">
                {name || email || "Signed in"}
              </div>
            </div>
            <Cog6ToothIcon className="h-4 w-4 shrink-0 text-emerald-300/70" />
          </div>
        </div>

        <nav className="h-[calc(100%-5.35rem)] overflow-y-auto px-2 py-2">
          <div className="grid grid-cols-3 items-start gap-2">
            {navigationColumns.map((groups, columnIndex) => (
              <div key={columnIndex} className="grid content-start gap-2">
                {groups.map((group) => (
                  <div
                    key={group.title}
                    className={`rounded-xl border p-2 ${groupTintClasses(group.tint)}`}
                  >
                    <div className="mb-1.5 px-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">
                      {group.title}
                    </div>
                    <div className="grid gap-1">
                      {group.items.map((item) => {
                        const active = activeHref === item.href;
                        const Icon = item.icon;
                        const showMessageBadge =
                          item.href === "/admin/messaging" &&
                          unreadMessagingCount > 0;
                        const showDisputeAlert =
                          item.href === "/admin/results" &&
                          openDisputeCount > 0;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={navItemClasses(Boolean(active))}
                          >
                            <span
                              className={[
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition",
                                active
                                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                                  : "border-white/10 bg-black/25 text-white/45 group-hover:text-white/75",
                              ].join(" ")}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10px] font-semibold">
                                {item.name}
                              </span>
                              <span className="block truncate text-[8px] text-white/40">
                                {item.description}
                              </span>
                            </span>
                            {showMessageBadge ? (
                              <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[7px] font-black text-black">
                                {unreadMessagingCount > 99
                                  ? "99+"
                                  : unreadMessagingCount}
                              </span>
                            ) : null}
                            {showDisputeAlert ? (
                              <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.85)]" />
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
