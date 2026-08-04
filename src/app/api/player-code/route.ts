import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

type PlayerCodeRow = {
  playerCode: string;
  firstName: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const rows = await prisma.$queryRaw<PlayerCodeRow[]>`
    SELECT
      "playerCode",
      COALESCE(NULLIF(SPLIT_PART(TRIM(COALESCE("name", '')), ' ', 1), ''), 'Player') AS "firstName"
    FROM "User"
    WHERE LOWER("email") = ${email}
    LIMIT 1
  `;

  const player = rows[0];
  if (!player) {
    return NextResponse.json({ error: "Player account not found" }, { status: 404 });
  }

  return NextResponse.json(player, {
    headers: { "Cache-Control": "no-store" },
  });
}
