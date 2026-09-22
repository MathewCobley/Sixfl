import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { getPlayerTeamMembershipsByUserId } from "@/lib/players/player-team-memberships";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Switch team account | SIXFL Player App" };

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

export default async function PlayerSwitchTeamAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/player/team/${teamid}/switch-account`,
      )}`,
    );
  }

  const user = await prisma.user.findUnique({
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
  });

  if (!user) notFound();

  const requestedPreviewMembershipId =
    user.role === UserRole.ADMIN ? sp.previewMembershipId?.trim() || null : null;
  const previewMembership = requestedPreviewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: requestedPreviewMembershipId, teamId: teamid },
        select: { id: true, userId: true },
      })
    : null;

  if (requestedPreviewMembershipId && !previewMembership) notFound();

  const effectiveUserId =
    previewMembership?.userId ?? user.teamMembers[0]?.userId ?? null;
  if (!effectiveUserId) notFound();

  const membershipMap = await getPlayerTeamMembershipsByUserId([effectiveUserId]);
  const memberships = membershipMap.get(effectiveUserId) ?? [];

  return (
    <main className="px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/70">
            Player app
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            Switch team account
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Each team account keeps its own fixtures, availability, payments and stats.
          </p>
        </div>

        <section className="mt-5 space-y-2">
          {memberships.map((membership) => {
            const current = membership.teamId === teamid;
            const href = requestedPreviewMembershipId
              ? `/player/team/${membership.teamId}?previewMembershipId=${encodeURIComponent(
                  membership.membershipId,
                )}&pwaPreview=1`
              : `/player/team/${membership.teamId}`;
            const leagueLabel = [membership.leagueName, membership.leagueSeason]
              .filter(Boolean)
              .join(" · ");

            const card = (
              <>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-xs font-black text-violet-100">
                  {initials(membership.teamName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-white">
                    {membership.teamName}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-white/40">
                    {leagueLabel || "SIXFL team"} · {membership.role.replaceAll("_", " ")}
                  </span>
                </span>
                <span
                  className={[
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black",
                    current
                      ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "bg-violet-300 text-black",
                  ].join(" ")}
                >
                  {current ? "VIEWING" : "SWITCH"}
                </span>
              </>
            );

            return current ? (
              <div
                key={membership.membershipId}
                aria-current="page"
                className="flex min-h-[4.75rem] items-center gap-3 rounded-[1.3rem] border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-3"
              >
                {card}
              </div>
            ) : (
              <Link
                key={membership.membershipId}
                href={href}
                className="flex min-h-[4.75rem] items-center gap-3 rounded-[1.3rem] border border-white/10 bg-white/[0.04] px-3 py-3 active:bg-violet-500/10"
              >
                {card}
              </Link>
            );
          })}

          {memberships.length <= 1 ? (
            <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/45">
              You currently have one linked team account.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
