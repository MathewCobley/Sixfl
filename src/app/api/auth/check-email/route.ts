// ========================================
// File: src/app/api/auth/check-email/route.ts
// ========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ exists: false });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  return NextResponse.json({
    exists: !!user,
  });
}