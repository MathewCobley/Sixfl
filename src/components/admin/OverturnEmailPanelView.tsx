import Link from "next/link";
import { getCommunicationStatusInfo } from "@/lib/communications/status";
import type { getResultOverturnEmailPanel } from "@/lib/fixtures/result-overturn-email";
import OverturnEmailButton from "./OverturnEmailButton";

export default function OverturnEmailPanelView({ fixtureId, decisionId, panel, action }: {
  fixtureId: string;
  decisionId: string;
  panel: Awaited<ReturnType<typeof getResultOverturnEmailPanel>>;
  action: (form: FormData) => Promise<void>;
}) {
  return <section className="space-y-4 rounded-2xl border border-emerald-300/25 p-5 text-sm text-white/80">
    <h2 className="text-xl font-semibold text-white">Notify both teams</h2>
    <p>A separate email goes to each team&apos;s contact/captains. Duplicate email addresses receive one copy. No SMS is sent.</p>
    <p>Teams: <strong>{panel.teamNames.join(" and ")}</strong></p>
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-semibold text-white">{panel.subject}</p>
      <p className="whitespace-pre-wrap leading-6">{panel.body}</p>
      <p className="text-xs text-emerald-100">The email also includes a link to the public league results.</p>
    </div>
    <p className="text-amber-100">Private admin evidence and rules notes are never included. The reason above is the standard public reason only.</p>
    {panel.records.length ? <div className="space-y-3">
      <h3 className="font-semibold text-white">Email status</h3>
      {panel.records.map((record) => <div key={record.id} className="rounded-xl border border-white/10 p-3">
        <p className="break-words font-semibold">{record.teamName} · {record.email}</p>
        <p>{getCommunicationStatusInfo({ channel: "EMAIL", status: record.status }).label}
          {record.sentAt ? ` · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(record.sentAt)}` : ""}</p>
        <Link href={`/admin/queue/${record.id}`} className="text-emerald-200 underline">View message status</Link>
      </div>)}
    </div> : <p>No notice emails have been queued for this decision.</p>}
    <form action={action} className="space-y-4">
      <input type="hidden" name="fixtureId" value={fixtureId}/>
      <input type="hidden" name="decisionId" value={decisionId}/>
      <label className="flex items-start gap-3 leading-6"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="confirmed" value="yes" required/><span>I have reviewed the notice above and want to email both teams&apos; captains.</span></label>
      <div className="flex flex-wrap items-center gap-4"><OverturnEmailButton/><Link className="text-emerald-200 underline" href={`/admin/fixtures/${fixtureId}/result`}>Refresh email status</Link></div>
    </form>
    <p className="text-xs leading-5 text-white/60">Queueing is not confirmation of delivery. The normal email worker sends the notices and the status updates here. Repeated clicks do not resend existing notices; review failed, skipped or cancelled notices in the message queue.</p>
  </section>;
}
