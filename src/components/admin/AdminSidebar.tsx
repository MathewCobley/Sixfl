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
import {
  adminNavigationLinks,
  type AdminNavigationIcon,
} from "@/lib/adminNavigation";

type AdminSidebarProps = {
  name?: string | null;
  email?: string | null;
  unreadMessagingCount?: number;
};

const iconMap: Record<AdminNavigationIcon, typeof ShieldCheckIcon> = {
  calendar: CalendarDaysIcon,
  card: CreditCardIcon,
  cog: Cog6ToothIcon,
  document: DocumentTextIcon,
  map: MapPinIcon,
  photo: PhotoIcon,
  search: MagnifyingGlassIcon,
  shield: ShieldCheckIcon,
  teams: UserGroupIcon,
  trophy: TrophyIcon,
  users: UsersIcon,
  warning: ExclamationTriangleIcon,
};

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
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {name?.trim() || "Admin"}
                </div>
                <div className="mt-1 truncate text-sm text-white/45">
                  {email?.trim() || "SIXFL operations"}
                </div>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                <Cog6ToothIcon className="h-5 w-5 text-emerald-300" />
              </div>
            </div>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-2 p-4 xl:grid-cols-2">
          {adminNavigationLinks.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
            const Icon = iconMap[item.icon];
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
