"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabs = [
  { href: "/admin/messaging", label: "Inbox", kind: "inbox" as const },
  { href: "/admin/messaging?view=send", label: "Send messages", kind: "send" as const },
  { href: "/admin/messaging/announcements", label: "Announcements", kind: "announcements" as const },
] as const;

export default function CommunicationsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const messagingView = searchParams.get("view") === "send" ? "send" : "inbox";

  return (
    <nav
      aria-label="Communications sections"
      className="mx-4 mt-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 sm:mx-6 lg:mx-8"
    >
      {tabs.map((tab) => {
        const active =
          tab.kind === "inbox"
            ? pathname === "/admin/messaging" && messagingView === "inbox"
            : tab.kind === "send"
              ? pathname === "/admin/messaging" && messagingView === "send"
              : pathname === "/admin/messaging/announcements" ||
                pathname.startsWith("/admin/messaging/announcements/");

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
