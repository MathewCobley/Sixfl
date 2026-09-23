import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import MonthlyGoalsPanel from "@/components/goal-of-month/MonthlyGoalsPanel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goal of the Month | SIXFL Player App" };

export default async function PlayerGoalOfTheMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/goal-of-the-month`)}`,
    );

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      role: true,
      teamMembers: { where: { teamId: teamid }, select: { id: true }, take: 1 },
    },
  });
  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0))
    notFound();
  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true },
  });
  if (!team) notFound();

  const requestedPreviewMembershipId = (
    await searchParams
  )?.previewMembershipId?.trim();
  const preview =
    user.role === UserRole.ADMIN && requestedPreviewMembershipId
      ? await prisma.teamMember.findFirst({
          where: { id: requestedPreviewMembershipId, teamId: teamid },
          select: { id: true },
        })
      : null;
  const moreHref = `/player/team/${teamid}/more${preview ? `?previewMembershipId=${encodeURIComponent(preview.id)}` : ""}`;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-xl space-y-3">
        <header>
          <Link
            href={moreHref}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-200"
          >
            ← More
          </Link>
          <h1 className="mt-1 text-xl font-black tracking-tight">
            Goal of the Month
          </h1>
        </header>
        {/* Preview context is navigation only: the shared API uses the signed-in voter. */}
        <MonthlyGoalsPanel playerApp />
      </div>
    </main>
  );
}
