"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { PlayerPaymentResendError, queuePlayerPaymentEmailResend } from "@/lib/notifications/player-payment-resend";

export type PlayerPaymentResendState = { ok: boolean; message: string; dispatchId?: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function resendPlayerPaymentEmailAction(
  _previous: PlayerPaymentResendState,
  form: FormData,
): Promise<PlayerPaymentResendState> {
  const access = await requireAdmin();
  if (!access.user?.id) return { ok: false, message: "Sign in as a SIXFL administrator before resending." };
  if (text(form, "confirmed") !== "on") return { ok: false, message: "Confirm the recipient before resending." };
  const referenceType = text(form, "referenceType");
  if (referenceType !== "message" && referenceType !== "dispatch") return { ok: false, message: "Reload this player's communications and try again." };
  const teamId = text(form, "teamId"), membershipId = text(form, "membershipId");
  let result;
  try {
    result = await queuePlayerPaymentEmailResend({ teamId, membershipId, referenceType,
      referenceId: text(form, "referenceId"), expectedEmail: text(form, "expectedEmail"), actorUserId: access.user.id });
  } catch (error) {
    if (error instanceof PlayerPaymentResendError) return { ok: false, message: error.message };
    console.error("Player payment email resend could not be confirmed", { teamId, membershipId });
    return { ok: false, message: "The resend could not be confirmed. Check the timeline before retrying; no payment has been changed." };
  }
  // A cache-refresh failure must not turn a saved queue receipt into an error
  // that encourages a second send.
  try {
    revalidatePath(`/admin/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(membershipId)}/communications`);
    revalidatePath("/admin/messaging");
  } catch { console.error("Payment resend saved; communications refresh requires retry", { dispatchId: result.dispatchId }); }
  return { ok: true, dispatchId: result.dispatchId,
    message: result.reused ? "A payment email is already queued or was resent recently. No duplicate was created."
      : "Payment email queued to resend. The original message and payment are unchanged." };
}
