import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { recordAuthenticatedReturnVisit } from "@/lib/auth/authenticated-return-visits";

export async function POST() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as ({ id?: string; email?: string | null } | undefined);
  const userId = sessionUser?.id?.trim();

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await recordAuthenticatedReturnVisit({
    userId,
    email: sessionUser?.email ?? null,
  });

  return NextResponse.json({ ok: true, recorded: result.recorded, reason: result.reason });
}
