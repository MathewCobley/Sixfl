"use server";
import { requireAdmin } from "@/lib/requireAdmin";
import { previewPlayerPaymentWarning, sendPlayerPaymentWarning } from "@/lib/payments/player-payment-warning";
import { PaymentWarningError } from "@/lib/payments/player-payment-warning-policy";
import { revalidatePath } from "next/cache";

async function adminId() {
  const { user } = await requireAdmin();
  if (!user?.id) throw new PaymentWarningError("Sign in with an administrator account to prepare a payment warning.");
  return user.id;
}
function message(error: unknown) {
  if (error instanceof PaymentWarningError) return error.message;
  console.error("Individual player warning failed", error);
  return "The warning could not be completed. Check the warning history before retrying.";
}
export async function previewPlayerWarningAction(input: { feeId: string; channel: string; deadlineLocal: string }) {
  // Authorize outside the error wrapper: Next.js login redirects must propagate.
  const actorId = await adminId();
  try { return { ok: true as const, preview: await previewPlayerPaymentWarning({ ...input, actorId }) }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function sendPlayerWarningAction(previewToken: string) {
  const actorId = await adminId();
  try {
    const receipt = await sendPlayerPaymentWarning({ previewToken, actorId });
    revalidatePath("/admin/payments");
    revalidatePath("/admin/payments/player-warning");
    return { ok: true as const, receipt };
  } catch (error) { return { ok: false as const, error: message(error) }; }
}
