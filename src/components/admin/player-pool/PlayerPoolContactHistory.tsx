import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { type PoolContactState, playerPoolChaseBlock } from "@/lib/player-pool/contact-history";

function asDate(value: string) {
  return new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
}
function stamp(date: Date | null) {
  return date ? formatDateTimeInLondon(date, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
}
export default function PlayerPoolContactHistory({ state }: { state: PoolContactState | undefined }) {
  if (!state) return <p className="mt-4 text-sm text-amber-100">Contact history unavailable. Review Player comms before chasing.</p>;
  const block = playerPoolChaseBlock(state);
  const events = [...state.events].sort((a,b) => asDate(b.at).getTime()-asDate(a.at).getTime());
  return <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs leading-5" aria-label="PlayerPool contact history">
    <h4 className="font-bold text-white">Invitations, chases &amp; responses</h4>
    <div className="mt-2 text-white/60">Last recorded send: {stamp(state.lastSentAt)}</div>
    <div className="text-white/60">Latest response: {stamp(state.lastReplyAt)}</div>
    {block ? <p className="mt-2 text-amber-100">{block}</p> : <p className="mt-2 text-emerald-200">Eligible for a yes/no follow-up.</p>}
    {events.length ? <details className="mt-2">
      <summary className="cursor-pointer font-semibold text-sky-100">View contact history ({events.length})</summary>
      <div className="mt-2 space-y-2">{events.slice(0,20).map(event => <div key={`${event.kind}:${event.id}`} className="border-t border-white/10 pt-2 text-white/65">
        <div className="font-semibold text-white/85">{event.kind} · {event.channel} · {event.status.toLowerCase().replaceAll('_',' ')}</div>
        <div>{stamp(asDate(event.at))}{event.by ? ` · ${event.by}` : ""}</div>
        {event.channel === 'WEB' ? null : event.threadId ? <Link className="text-sky-200 underline" href={`/admin/player-prospects/${state.prospectId}/communications`}>Review conversation</Link> : <Link className="text-sky-200 underline" href={`/admin/queue/${event.id}`}>Open delivery record</Link>}
      </div>)}</div>
    </details> : <p className="mt-2 text-white/50">No linked message evidence found. The invitation date alone does not prove delivery.</p>}
    <p className="mt-2 text-[11px] text-white/40">Sent means recorded as sent, not proof it was read. Replies from a linked email or mobile need review; they are not automatically treated as a yes or no.</p>
  </section>;
}
