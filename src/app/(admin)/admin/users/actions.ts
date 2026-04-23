// ========================================
// File: src/app/(admin)/admin/users/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export async function updateAdminUserProfileAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const from = getSafeRedirectPath(formData.get("from"), "/admin/users");

  if (!userId) {
    redirect(`${from}?error=Missing%20user%20id.`);
  }

  if (!name) {
    redirect(`${from}?error=Name%20is%20required.`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
    },
  });

  revalidatePath("/admin/users");
  redirect(`${from}?saved=1`);
}
