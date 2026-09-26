import { notFound } from "next/navigation";

import MonthlyGoalsPanel from "@/components/goal-of-month/MonthlyGoalsPanel";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goal of the Month | SIXFL Captain App" };

export default async function CaptainGoalOfTheMonthPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true },
  });
  if (!team) notFound();

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-xl space-y-3">
        <header className="flex min-h-11 items-center">
          <h1 className="min-w-0 text-lg font-bold tracking-tight">
            Goal of the Month
          </h1>
        </header>
        <MonthlyGoalsPanel playerApp />
      </div>
    </main>
  );
}
