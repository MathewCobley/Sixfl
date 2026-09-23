import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import MonthlyGoalsPanel from "@/components/goal-of-month/MonthlyGoalsPanel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goal of the Month | SIXFL Player App" };

export default async function PlayerGoalOfTheMonthPage({ params, searchParams }: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/goal-of-the-month`)}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true, teamMembers: { where: { teamId: teamid }, select: { id: true }, take: 1 } },
  });
  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0)) notFound();
  const team = await prisma.team.findUnique({ where: { id: teamid }, select: { id: true } });
  if (!team) notFound();

  const requestedPreviewMembershipId = (await searchParams)?.previewMembershipId?.trim();
  const preview = user.role === UserRole.ADMIN && requestedPreviewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: requestedPreviewMembershipId, teamId: teamid }, select: { id: true },
      })
    : null;
  const moreHref = `/player/team/${teamid}/more${preview ? `?previewMembershipId=${encodeURIComponent(preview.id)}` : ""}`;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <header>
          <Link href={moreHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-200">← More</Link>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">Player app</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Goal of the Month</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">Nominate your favourite goals, vote for the shortlist and watch the monthly winners.</p>
        </header>
        {/* Preview context is navigation only: the shared API uses the signed-in voter. */}
        <MonthlyGoalsPanel playerApp />
      </div>
    </main>
  );
}
