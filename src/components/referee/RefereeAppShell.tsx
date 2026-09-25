import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  EllipsisHorizontalCircleIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";

import RefereePortalViewMode from "@/components/referee/RefereePortalViewMode";
import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type RefereeAppSection = "home" | "nights" | "availability" | "ledger" | "more";

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
      key: "more" as const,
      href: "/referee/more",
      label: "More",
      Icon: EllipsisHorizontalCircleIcon,
    },
  ];

  return (
    <>
      <RefereePortalViewMode mode="app">
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
      </RefereePortalViewMode>

      <RefereePortalViewMode mode="web">
        <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
              <div className="flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Link href="/referee" aria-label="SIXFL referee home" className="shrink-0">
                    <img src="/logo2.png" alt="SIXFL" className="h-8 w-auto object-contain" />
                  </Link>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-emerald-300/70">Referee Portal</div>
                    <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white">{title}</h1>
                  </div>
                </div>

                {canSwitchViewer ? (
                  <Link
                    href="/dashboard?app=1"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07] hover:text-white"
                  >
                    <ArrowsRightLeftIcon className="h-5 w-5" />
                    Switch app viewer
                  </Link>
                ) : null}
              </div>

              <nav
                aria-label="Referee desktop navigation"
                className="grid grid-cols-2 gap-2 border-t border-white/10 px-5 py-4 sm:grid-cols-5"
              >
                {items.map(({ key, href, label, Icon }) => {
                  const isActive = key === active;
                  return (
                    <Link
                      key={key}
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition ${
                        isActive
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </section>

            <div className="space-y-6">{children}</div>
          </div>
        </main>
      </RefereePortalViewMode>
    </>
  );
}
