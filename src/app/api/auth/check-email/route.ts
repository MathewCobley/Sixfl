// ========================================
// File: src/app/api/auth/check-email/route.ts
// ========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPendingCaptainContext } from "@/lib/auth/pendingCaptain";

export async function POST(req: Request) {
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").toLowerCase().trim();

  if (!normalizedEmail) {
    return NextResponse.json({
      exists: false,
      pendingCaptain: false,
      canLogin: false,
      claimCode: null,
      teamName: null,
    });
  }

  const [user, pendingCaptain] = await Promise.all([
    prisma.user.findUnique({
      where: { email: normalizedEmail },
    }),
    getPendingCaptainContext(normalizedEmail),
  ]);

  return NextResponse.json({
    exists: !!user,
    pendingCaptain: !!pendingCaptain,
    canLogin: !!user || !!pendingCaptain,
    claimCode: pendingCaptain?.claimCode ?? null,
    teamName: pendingCaptain?.teamName ?? null,
  });
}
