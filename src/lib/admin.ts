// ========================================
// File: src/lib/admin.ts
// ========================================

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { UserRole } from "@prisma/client";

export async function requireAdmin() {
  const session = await auth();

  const email = session?.user?.email;
  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return { session, user };
}

export async function requireReferee() {
  const session = await auth();

  const email = session?.user?.email;
  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user || (user.role !== UserRole.REFEREE && user.role !== UserRole.ADMIN)) {
    redirect("/dashboard");
  }

  return { session, user };
}