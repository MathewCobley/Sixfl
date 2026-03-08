// ========================================
// File: src/lib/admin.ts
// ========================================

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/auth";
import { UserRole } from "@prisma/client";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);

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
  const session = await getServerSession(authOptions);

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