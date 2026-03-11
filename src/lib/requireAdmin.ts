// ========================================
// File: src/lib/requireAdmin.ts
// ========================================

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

const SUPER_ADMINS = [
  "hello@sixfl.co.uk",
  "mathew@sixfl.co.uk",
  "mathewcobley1@gmail.com",
];

export async function requireAdmin() {
  // TEMPORARY DEV BYPASS
  if (process.env.NODE_ENV !== "production") {
    return { session: null, user: null };
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email.toLowerCase().trim();
  const isSuperAdmin = SUPER_ADMINS.includes(email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  const isAdmin = user?.role === UserRole.ADMIN;

  if (!isAdmin && !isSuperAdmin) {
    redirect("/dashboard");
  }

  return { session, user };
}