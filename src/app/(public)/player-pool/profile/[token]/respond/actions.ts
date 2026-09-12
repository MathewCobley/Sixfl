"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { declinePlayerPoolResponse } from "@/lib/player-pool/response-chases";
export async function declineResponseAction(token: string) {
  const closed = await declinePlayerPoolResponse(token);
  revalidatePath("/admin/player-pool");
  redirect(`/player-pool/profile/${encodeURIComponent(token)}/respond?result=${closed ? "closed" : "unchanged"}`);
}
