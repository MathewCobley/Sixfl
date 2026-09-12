import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import type { ContactEvent, ContactHistory } from "@/lib/player-pool/response-policy";
const date = (d: Date) => formatDateTimeInLondon(d, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const labels: Record<string,string> = { INVITATION: "Profile invitation", REMINDER: "Profile reminder email", SMS_CHASE: "SMS profile chase", OTHER_CONTACT: "Other contact", REPLY: "Reply received — review Player comms", NOT_LOOKING: "No longer looking — confirmed" };
function Entry({ event }: { event: ContactEvent }) {
  return <li className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5">
    <div className="flex flex-wrap justify-between gap-x-3"><strong>{labels[event.kind] || event.kind}</strong><span className={event.status === "SENT" || event.status === "CONFIRMED" ? "text-emerald-200" : "text-amber-100"}>{event.status.replaceAll("_"," ")}</span></div>
    <div className="text-white/60">{event.channel} · {date(event.at)} · {event.author}</div>
    {event.status === "QUEUED" && event.scheduledFor ? <div className="text-white/55">Scheduled: {date(event.scheduledFor)} — not yet sent</div> : null}
    {event.deliveryStatus && !["sent","queued","processing"].includes(event.deliveryStatus.toLowerCase()) ? <div className="text-white/55">Provider update: {event.deliveryStatus}</div> : null}
    {event.href ? <Link href={event.href} className="font-semibold text-emerald-200 underline underline-offset-2">Open record</Link> : null}
  </li>;
}
export default function PlayerPoolContactHistory({ history }: { history: ContactHistory }) {
  return <section className="mt-4 border-t border-white/10 pt-4" aria-label="PlayerPool contact history">
    <h4 className="text-xs font-bold text-white/80">Invitations, chases &amp; responses</h4>
    {history.latestReplyAt ? <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-100">Reply recorded {date(history.latestReplyAt)}. Further chases are blocked pending review; a reply is not automatically treated as a decline.</p> : null}
    {history.emailBlocked || history.smsBlocked ? <p className="mt-2 text-xs text-amber-100">{history.emailBlocked ? "Email is suppressed/opted out. " : ""}{history.smsBlocked ? "SMS is suppressed/opted out." : ""}</p> : null}
    {history.events.length ? <>
      <ul className="mt-2 space-y-2">{history.events.slice(0,4).map(event => <Entry key={event.id} event={event} />)}</ul>
      {history.events.length > 4 ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-emerald-200">Show older contact records ({history.events.length - 4})</summary><ul className="mt-2 space-y-2">{history.events.slice(4).map(event => <Entry key={event.id} event={event} />)}</ul></details> : null}
    </> : <p className="mt-2 text-xs text-white/55">No linked delivery or reply records found. An invitation date alone does not prove an email was sent.</p>}
    <p className="mt-2 text-[11px] leading-5 text-white/40">Sent means accepted for sending, not necessarily delivered or read. Other contact may come from the same email or phone; check the record before drawing conclusions.</p>
  </section>;
}
