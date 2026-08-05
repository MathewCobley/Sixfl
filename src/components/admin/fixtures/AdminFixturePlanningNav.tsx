"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/fixtures", label: "Fixtures", exact: true },
  { href: "/admin/fixtures/generate", label: "Fixture generator", exact: false },
  { href: "/admin/team-unavailability", label: "Teams unavailable", exact: true },
] as const;

export default function AdminFixturePlanningNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Fixture planning"
      className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex min-h-10 items-center rounded-xl border border-emerald-300/30 bg-emerald-400 px-4 py-2 text-sm font-semibold text-black"
                : "inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
