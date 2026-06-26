// ========================================
// File: src/lib/admin.ts
// ========================================

import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const REFEREE_PREVIEW_COOKIE = "sixfl-referee-preview-user";

type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
};

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

async function getRefereePreviewUser(adminUser: AuthUser) {
  if (adminUser.role !== UserRole.ADMIN) return null;

  const cookieStore = await cookies();
  const previewUserId = cookieStore.get(REFEREE_PREVIEW_COOKIE)?.value?.trim();

  if (!previewUserId) return null;

  const referee = await prisma.user.findUnique({
    where: { id: previewUserId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) return null;

  return referee;
}

export async function requireReferee() {
  const session = await getServerSession(authOptions);

  const email = session?.user?.email;
  if (!email) redirect("/login");

  const authenticatedUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!authenticatedUser || (authenticatedUser.role !== UserRole.REFEREE && authenticatedUser.role !== UserRole.ADMIN)) {
    redirect("/dashboard");
  }

  const previewUser = await getRefereePreviewUser(authenticatedUser);

  return {
    session,
    user: previewUser ?? authenticatedUser,
    authenticatedUser,
    isAdminPreview: Boolean(previewUser),
  };
}
