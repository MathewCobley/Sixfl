import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";

import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type RefereeAppSection = "home" | "nights" | "availability" | "ledger" | "rules";

export default async function RefereeAppShell({
  active,
  title,
  children,
}: {
  active: RefereeAppSection;
  title: string;
  children: ReactNode;
}) {
  const { authenticatedUser, isAdminPreview } = await requireReferee();
  const linkedPlayerMembership = !isAdminPreview
    ? await prisma.teamMember.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      })
    : null;
  const canSwitchViewer = Boolean(linkedPlayerMembership);

  const items = [
    { key: "home" as const, href: "/referee", label: "Home", Icon: HomeIcon },
    {
      key: "nights" as const,
      href: "/referee/nights",
      label: "Nights",
      Icon: ClipboardDocumentListIcon,
    },
    {
      key: "availability" as const,
      href: "/referee/availability",
      label: "Availability",
      Icon: CalendarDaysIcon,
    },
    {
      key: "ledger" as const,
      href: "/referee/ledger",
      label: "Ledger",
      Icon: BanknotesIcon,
    },
    {
      key: "rules" as const,
      href: "/referee/match-rules",
      label: "Rules",
      Icon: BookOpenIcon,
    },
  ];

  return (
    <main className="min-h-screen bg-[#07130f] text-white">
      <header
        className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#06110e]/95 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.8rem)" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <Link href="/referee" aria-label="SIXFL referee home" className="shrink-0">
            <img src="/logo2.png" alt="SIXFL" className="h-7 w-auto object-contain" />
          </Link>
          <div className="min-w-0 flex-1 text-center text-sm font-black tracking-tight text-white">
            {title}
          </div>
          {canSwitchViewer ? (
            <Link
              href="/dashboard?app=1"
              aria-label="Switch app viewer"
              title="Switch app viewer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 active:bg-white/[0.08] active:text-white"
            >
              <ArrowsRightLeftIcon className="h-5 w-5" />
            </Link>
          ) : (
            <div className="h-9 w-9 shrink-0" aria-hidden="true" />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">
        {children}
      </div>

      <nav
        aria-label="Referee app navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050807]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {items.map(({ key, href, label, Icon }) => {
            const isActive = key === active;
            return (
              <Link
                key={key}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${
                  isActive
                    ? "bg-emerald-400/10 text-emerald-200"
                    : "text-white/55"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
