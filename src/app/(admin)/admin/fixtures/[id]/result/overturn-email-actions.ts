"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueResultOverturnEmails, ResultOverturnEmailError } from "@/lib/fixtures/result-overturn-email";

export async function emailOverturnedResultAction(form: FormData) {
  const access = await requireAdmin();
  if (!access.user || access.user.role !== "ADMIN") throw new Error("Administrator access is required.");
  const fixtureId = String(form.get("fixtureId") ?? "").trim();
  const decisionId = String(form.get("decisionId") ?? "").trim();
  const page = `/admin/fixtures/${encodeURIComponent(fixtureId)}/result`;
  try {
    await queueResultOverturnEmails({
      fixtureId, decisionId, actorUserId: access.user.id, confirmed: form.get("confirmed") === "yes",
    });
  } catch (error) {
    // Never log the decision, submitted text or raw provider/database errors.
    const message = error instanceof ResultOverturnEmailError ? error.message
      : "Email queueing could not be confirmed. Check the status below before retrying. The result is unchanged.";
    redirect(`${page}?noticeError=${encodeURIComponent(message)}`);
  }
  for (const path of [page, "/admin/queue", "/admin/messages"]) revalidatePath(path);
  redirect(`${page}?noticeChecked=1`);
}
