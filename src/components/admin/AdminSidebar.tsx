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
        name: "Drop team",
        href: "/admin/fixtures/drop-team",
        icon: ExclamationTriangleIcon,
        description: "Remove draft fixtures",
      },
      {
        name: "Carry fees",
        href: "/admin/fixtures/carry-forward-payments",
        icon: CreditCardIcon,
        description: "Postponed payments",
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
        name: "Team credits",
        href: "/admin/payments/team-credits",
        icon: CreditCardIcon,
        description: "Credit ledger",
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
        description: "Message content",
      },
      {
        name: "Team messages",
        href: "/admin/team-messages",
        icon: DocumentTextIcon,
        description: "Captain updates",
      },
      {
        name: "Social posts",
        href: "/admin/social",
        icon: PhotoIcon,
        description: "Fixture/results cards",
      },
      {
        name: "Settings",
        href: "/admin/settings",
        icon: Cog6ToothIcon,
        description: "Platform config",
      },
    ],
  },
];

function navItemClasses(active: boolean) {
  return [
    "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition",
    active
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50 shadow-[0_10px_30px_rgba(16,185,129,0.08)]"
      : "border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/85",
  ].join(" ");
}

export default function AdminSidebar({ name, email, unreadMessagingCount = 0 }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col border-r border-white/10 bg-[#070d0b]/95 px-4 py-5 backdrop-blur-xl">
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300/90">SIXFL</div>
        <div className="mt-2 text-lg font-semibold text-white">Admin Console</div>
        <div className="mt-2 text-xs text-white/45">
          {name || email || "Signed in"}
        </div>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
        {navigationGroups.map((group) => (
          <div key={group.title}>
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/28">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
                const Icon = item.icon;
                const showBadge = item.href === "/admin/messaging" && unreadMessagingCount > 0;

                return (
                  <Link key={item.href} href={item.href} className={navItemClasses(Boolean(active))}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.name}</span>
                        {showBadge ? (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            {unreadMessagingCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-white/35">{item.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
