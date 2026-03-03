import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Create or find team
  let team = await prisma.team.findFirst({
    where: { name: "My First Team" },
  });

  if (!team) {
    team = await prisma.team.create({
      data: { name: "My First Team" },
    });
  }

  // Link user as manager
  await prisma.teamMember.upsert({
    where: {
      teamId_userId: {
        teamId: team.id,
        userId: user.id,
      },
    },
    update: { role: "MANAGER" },
    create: {
      teamId: team.id,
      userId: user.id,
      role: "MANAGER",
    },
  });

  // Create fixture if none exist
  const existing = await prisma.fixture.findFirst();

  if (!existing) {
    const opp = await prisma.team.create({
      data: { name: "Opposition FC" },
    });

    await prisma.fixture.create({
      data: {
        kickoffAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        venue: "TBC",
        homeTeamId: team.id,
        awayTeamId: opp.id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}