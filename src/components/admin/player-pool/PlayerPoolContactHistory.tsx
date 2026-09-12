import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { playerPoolContactBlock, type PlayerPoolContactHistory as History } from "@/lib/player-pool/contact-history";

function when(value: Date | string | null) {
  return value ? formatDateTimeInLondon(new Date(value), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
}
export default function PlayerPoolContactHistory({ history, prospectId }: { history: History; prospectId: string }) {
  const block = playerPoolContactBlock(history, "EMAIL");
  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs leading-5" aria-label="Contact and reply history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-white/85">Contact &amp; reply history</h4>
        <Link className="font-semibold text-emerald-200 underline underline-offset-4" href={`/admin/player-prospects/${prospectId}/communications`}>Review Player comms</Link>
      </div>
      {history.squadMatch ? <div className="mt-2 rounded-lg border border-amber-400/25 p-3 text-amber-100">
        <strong>{history.squadMatch.definite ? "Already registered" : "Possible existing player"} — {history.squadMatch.teamNames}</strong>
        <p className="mt-1">{history.squadMatch.reason}</p>
        <Link className="mt-1 inline-block underline" href={`/admin/players/data-health?q=${encodeURIComponent(history.publicCode)}`}>Review in Player data health</Link>
      </div> : null}
      <p className="mt-1 text-white/55">Invitation recorded: {when(history.invitedAt)}. This date alone does not confirm an email was sent.</p>
      {block ? <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-2 text-amber-100">{block}</p> : <p className="mt-2 text-white/55">No inbound response recorded since this profile was created. Silence is not a decline.</p>}
      {history.events.length ? (
        <details className="mt-3" open={Boolean(history.latestReplyAt)}>
          <summary className="cursor-pointer font-semibold text-white/80">
            {history.events[0].kind} · {when(history.events[0].at)} · {history.events[0].status === "SENT" ? "Sent to provider" : history.events[0].status.toLowerCase()}
            <span className="block text-white/45">Show latest {history.events.length} contact records</span>
          </summary>
          <ol className="mt-2 divide-y divide-white/10">
            {history.events.map((event) => (
              <li key={event.id} className="break-words py-2">
                <div className="font-semibold text-white/80">{event.kind} · {event.channel}</div>
                <div className="text-white/60">{when(event.at)} · {event.status === "SENT" ? "Sent to provider — not proof of receipt" : event.status.toLowerCase()}{event.by ? ` · ${event.by}` : ""}</div>
                {event.subject ? <div className="text-white/55">{event.subject}</div> : null}
                {event.preview ? <p className="mt-1 whitespace-pre-wrap text-amber-100/85">{event.preview}</p> : null}
                {event.dispatchId ? <Link className="text-emerald-200 underline" href={`/admin/queue/${event.dispatchId}`}>Delivery record</Link> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : <p className="mt-2 text-white/55">No linked delivery or conversation records found. Check Player comms before assuming no contact was made.</p>}
    </section>
  );
}
