"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { closeAwaitingPlayerPoolProfile } from "@/lib/player-pool/response-chase";

// Explicit POST only: email scanners and preview GET requests never close anyone.
export async function declinePlayerPoolAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(token)) throw new Error("Invalid response link.");
  await closeAwaitingPlayerPoolProfile(token);
  revalidatePath("/admin/player-pool");
  redirect(`/player-pool/profile/${encodeURIComponent(token)}/respond`);
}
