import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { getPlayerTeamMembershipsByUserId } from "@/lib/players/player-team-memberships";
import { prisma } from "@/lib/prisma";
import {
  ArrowsRightLeftIcon,
  BookOpenIcon,
  ChartBarSquareIcon,
  ChevronRightIcon,
  GiftIcon,
  LifebuoyIcon,
  PlayCircleIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

type PageProps = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
};

function withPreview(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;
  const [path, hash = ""] = href.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}previewMembershipId=${encodeURIComponent(previewMembershipId)}${hash ? `#${hash}` : ""}`;
}

export default async function PlayerMorePage({
  params,
  searchParams,
}: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);
  const requestedPreviewMembershipId = sp.previewMembershipId?.trim() || null;

  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email.trim().toLowerCase() },
        select: {
          id: true,
          role: true,
          teamMembers: {
            where: { teamId: teamid },
            select: { id: true, userId: true },
            take: 1,
          },
        },
      })
    : null;

  const previewMembership =
    user?.role === UserRole.ADMIN && requestedPreviewMembershipId
      ? await prisma.teamMember.findFirst({
          where: { id: requestedPreviewMembershipId, teamId: teamid },
          select: { id: true, userId: true },
        })
      : null;

  const previewMembershipId =
    user?.role === UserRole.ADMIN ? (previewMembership?.id ?? null) : null;
  const effectiveUserId =
    previewMembership?.userId ?? user?.teamMembers[0]?.userId ?? null;
  const membershipMap = effectiveUserId
    ? await getPlayerTeamMembershipsByUserId([effectiveUserId])
    : new Map();
  const linkedTeamAccounts = effectiveUserId
    ? (membershipMap.get(effectiveUserId) ?? [])
    : [];

  const rows = [
    {
      href: withPreview(`/player/team/${teamid}/stats`, previewMembershipId),
      label: "My stats",
      description: "Appearances, goals, assists and player performance",
      icon: ChartBarSquareIcon,
    },
    {
      href: withPreview(`/player/team/${teamid}/tv`, previewMembershipId),
      label: "SIXFL TV",
      description: "Your team's highlights and recorded matches",
      icon: PlayCircleIcon,
    },
    {
      href: withPreview(
        `/player/team/${teamid}/goal-of-the-month`,
        previewMembershipId,
      ),
      label: "Goal of the Month",
      description: "Nominate goals, vote and watch the winners",
      icon: TrophyIcon,
    },
    {
      href: withPreview(
        `/player/team/${teamid}/referrals`,
        previewMembershipId,
      ),
      label: "Refer a team · £75",
      description: "Share your referral link and track rewards",
      icon: GiftIcon,
    },
    {
      href: withPreview(
        `/player/team/${teamid}/league-rules`,
        previewMembershipId,
      ),
      label: "League Rules",
      description: "Competition, payments, conduct and fixture rules",
      icon: BookOpenIcon,
    },
    {
      href: withPreview(
        `/player/team/${teamid}/match-rules`,
        previewMembershipId,
      ),
      label: "Match Rules",
      description: "The rules and procedures used on the pitch",
      icon: BookOpenIcon,
    },
    {
      href: withPreview(`/player/team/${teamid}/help`, previewMembershipId),
      label: "Help / Contact SIXFL",
      description: "Get help or send SIXFL a private message",
      icon: LifebuoyIcon,
    },
    ...(linkedTeamAccounts.length > 1
      ? [
          {
            href: withPreview(
              `/player/team/${teamid}/switch-account`,
              previewMembershipId,
            ),
            label: "Switch team account",
            description: `Choose between your ${linkedTeamAccounts.length} linked team accounts`,
            icon: ArrowsRightLeftIcon,
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-black tracking-tight">More</h1>

        {[rows.slice(0, 4), rows.slice(4, 7), rows.slice(7)]
          .filter((group) => group.length)
          .map((group, groupIndex) => (
            <section
              key={groupIndex}
              aria-label={["Explore", "Rules and help", "Account"][groupIndex]}
              className="mt-4 overflow-hidden rounded-2xl bg-white/[0.045]"
            >
              {group.map((row, index) => {
                const Icon = row.icon;
                return (
                  <Link
                    key={row.href}
                    href={row.href}
                    className={[
                      "flex min-h-14 items-center gap-4 px-4 py-3 active:bg-white/[0.05]",
                      index < group.length - 1
                        ? "border-b border-white/[0.06]"
                        : "",
                    ].join(" ")}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/[0.055] text-emerald-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white">
                        {row.label}
                      </span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-white/25" />
                  </Link>
                );
              })}
            </section>
          ))}

        <div className="mt-5">
          <Link
            href="/api/auth/signout"
            className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/45"
          >
            Sign out
          </Link>
        </div>
      </div>
    </main>
  );
}
