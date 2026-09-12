"use client";

import { useFormStatus } from "react-dom";
import type { getReferralIneligibilityEmailPanel } from "@/lib/referral-ineligibility-email";

function SendButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
    {pending ? "Queueing update…" : "Email referrer"}
  </button>;
}

export default function ReferralIneligibilityEmailPanelView({ referralId, panel, action }: {
  referralId: string; panel: Awaited<ReturnType<typeof getReferralIneligibilityEmailPanel>>;
  action: (form: FormData) => Promise<void>;
}) {
  const labels: Record<string, string> = { QUEUED: "Queued", PROCESSING: "Sending", SENT: "Sent", FAILED: "Failed", SKIPPED: "Skipped", CANCELLED: "Cancelled" };
  return <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
    <h3 className="font-bold text-slate-950">Referrer update email</h3>
    <p className="break-words">To: {panel.email || "No email address"}</p>
    {panel.record ? <div className="space-y-2">
      <p className="font-bold">Status: {labels[panel.record.status] || panel.record.status}</p>
      {panel.record.failureReason ? <p>{panel.record.failureReason}</p> : null}
      <a className="font-semibold text-emerald-800 underline" href={`/admin/queue/${panel.record.id}`}>View message status</a>
      {["FAILED", "SKIPPED", "CANCELLED"].includes(panel.record.status) ? <p>This update has not been sent. Open the message record to review the problem; duplicate notices are blocked.</p> : null}
    </div> : <p className="font-semibold text-amber-800">No eligibility update email has been queued.</p>}
    {panel.body ? <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer font-semibold">{panel.record ? "View recorded email" : "Preview email"}</summary>
      <p className="mt-3 font-bold">{panel.subject}</p><p className="mt-2 whitespace-pre-wrap break-words leading-6">{panel.body}</p>
    </details> : null}
    <p className="text-xs leading-5 text-slate-600">Only the standard eligibility reason is included. Your private admin note is never included. The wording is editable in System Templates → Referral not eligible email.</p>
    {panel.error ? <p role="alert" className="text-amber-900">{panel.error}</p> : null}
    {!panel.record && !panel.error ? <form action={action} className="space-y-3">
      <input type="hidden" name="referralId" value={referralId}/>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirmed" value="yes" required className="mt-1"/>I have reviewed the email and want to update the referrer.</label>
      <SendButton/>
    </form> : null}
    <p className="text-xs leading-5 text-slate-500">Queued is not confirmation of delivery. Refresh this page for the latest status. No SMS is sent.</p>
  </section>;
}
