import Link from "next/link";
import {
  BanknotesIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  GiftIcon,
  LifebuoyIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CaptainMorePage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const rows = [
    { href: `/captain/team/${teamid}/availability`, label: "Availability", icon: CalendarDaysIcon },
    { href: `/captain/team/${teamid}/results`, label: "Match reports", icon: ClipboardDocumentCheckIcon },
    { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad", icon: UserGroupIcon },
    { href: `/captain/team/${teamid}/messages`, label: "SIXFL inbox", icon: ChatBubbleLeftRightIcon },
    { href: `/captain/team/${teamid}/player-pool`, label: "PlayerPool", icon: UserGroupIcon },
    { href: `/captain/team/${teamid}/player-stats`, label: "Player stats", icon: ChartBarSquareIcon },
    { href: `/captain/team/${teamid}/tv`, label: "SIXFL TV", icon: PlayCircleIcon },
    { href: `/captain/team/${teamid}/veo-priority`, label: "Priority score", icon: TrophyIcon },
    { href: `/captain/team/${teamid}/payments`, label: "Team payments", icon: BanknotesIcon },
    { href: `/captain/team/${teamid}/kit`, label: "Team kit", icon: ShoppingBagIcon },
    { href: `/captain/team/${teamid}/weeks-unavailable`, label: "Fixture planning", icon: ClockIcon },
    { href: `/captain/team/${teamid}/whatsapp`, label: "WhatsApp tools", icon: ChatBubbleLeftRightIcon },
    { href: `/captain/team/${teamid}/cup-invitations`, label: "Cup invitations", icon: GiftIcon },
    { href: `/captain/team/${teamid}/rules`, label: "Match rules", icon: ShieldCheckIcon },
    { href: `/captain/team/${teamid}/guide`, label: "Captain guide", icon: BookOpenIcon },
    { href: `/captain/team/${teamid}/help`, label: "Help / Contact SIXFL", icon: LifebuoyIcon },
  ];

  return (
    <main className="mx-auto w-full max-w-xl pb-2">
      <h1 className="px-1 text-xl font-black tracking-tight text-white">More</h1>
      <div className="mt-3 overflow-hidden rounded-[1.15rem] border border-white/[0.07] bg-white/[0.035]">
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.href}
              href={row.href}
              className={`flex min-h-14 items-center gap-3 px-3.5 py-3 active:bg-white/[0.055] ${index > 0 ? "border-t border-white/[0.06]" : ""}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-200">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-white">{row.label}</span>
              <span aria-hidden="true" className="text-white/25">›</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
