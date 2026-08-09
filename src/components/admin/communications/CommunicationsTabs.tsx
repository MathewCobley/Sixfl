"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/messaging", label: "Inbox & communications", exact: true },
  { href: "/admin/messaging/announcements", label: "Announcements", exact: false },
] as const;

export default function CommunicationsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Communications sections"
      className="mx-4 mt-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 sm:mx-6 lg:mx-8"
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href || pathname === `${tab.href}/`
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              active
                ? "bg-emerald-500/15 text-emerald-100"
                : "text-white/60 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}

      <Link
        href="/admin/templates"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white"
      >
        Templates
      </Link>
    </nav>
  );
}
