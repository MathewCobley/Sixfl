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
    name: "Leads",
    href: "/admin/leads",
    icon: UsersIcon,
    description: "Inbound enquiries",
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

export default function AdminSidebar({
  name,
  email,
  unreadMessagingCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-6">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
            Admin console
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {name?.trim() || "Admin"}
                </div>
                <div className="mt-1 text-sm text-white/45">
                  {email?.trim() || "SIXFL operations"}
                </div>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                <Cog6ToothIcon className="h-5 w-5 text-emerald-300" />
              </div>
            </div>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-2 p-4">
          {navigation.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
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
                  "group flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 transition",
                  active
                    ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-white/8 bg-white/[0.02] text-white/75 hover:border-white/15 hover:bg-white/[0.05] hover:text-white",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
                    active
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-black/30 text-white/55 group-hover:text-white/80",
                  ].join(" ")}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold">
                      {item.name}
                    </div>

                    {unreadCount > 0 ? (
                      <span className="inline-flex min-w-[1.35rem] shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 truncate text-[11px] text-white/35">
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
