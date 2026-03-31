// ========================================
// File: src/components/admin/AdminSidebar.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MapPinIcon,
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
  },
  {
    name: "Teams",
    href: "/admin/teams",
    icon: UserGroupIcon,
  },
  {
    name: "Leagues",
    href: "/admin/leagues",
    icon: TrophyIcon,
  },
  {
    name: "Venues",
    href: "/admin/venues",
    icon: MapPinIcon,
  },
  {
    name: "Fixtures",
    href: "/admin/fixtures",
    icon: CalendarDaysIcon,
  },
  {
    name: "Referees",
    href: "/admin/referees",
    icon: ShieldCheckIcon,
  },
  {
    name: "Leads",
    href: "/admin/leads",
    icon: UsersIcon,
  },
  {
    name: "Messaging",
    href: "/admin/messaging",
    icon: DocumentTextIcon,
  },
  {
    name: "Email Templates",
    href: "/admin/email-templates",
    icon: DocumentTextIcon,
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
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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

        <nav className="space-y-2 p-4">
          {navigation.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
            const Icon = item.icon;
            const unreadCount =
              item.name === "Messaging" ? unreadMessagingCount : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "group flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
                  active
                    ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-white/8 bg-white/[0.02] text-white/75 hover:border-white/15 hover:bg-white/[0.05] hover:text-white",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition",
                    active
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-black/30 text-white/55 group-hover:text-white/80",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{item.name}</div>

                    {unreadCount > 0 ? (
                      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 text-xs text-white/35">
                    {item.name === "Overview" && "Admin dashboard"}
                    {item.name === "Teams" && "Squads and captains"}
                    {item.name === "Leagues" && "League setup"}
                    {item.name === "Venues" && "Match locations"}
                    {item.name === "Fixtures" && "Schedule and results"}
                    {item.name === "Referees" && "Officials and assignments"}
                    {item.name === "Leads" && "Inbound enquiries"}
                    {item.name === "Messaging" &&
                      (unreadCount > 0
                        ? `${unreadCount} unread thread${
                            unreadCount === 1 ? "" : "s"
                          }`
                        : "Campaigns and outreach")}
                    {item.name === "Email Templates" && "Reusable messaging"}
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