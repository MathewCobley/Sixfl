import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { type ContactEvent } from "@/lib/player-pool/followup-policy";
const labels: Record<string, string> = {
  PLAYER_POOL_PROFILE_INVITE: "Original invitation",
  PLAYER_POOL_PROFILE_NUDGE: "Profile reminder",
  PLAYER_POOL_PROFILE_SMS_NUDGE_1: "First SMS chase",
  PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL: "Final SMS chase",
  PLAYER_POOL_RESPONSE_CHASE: "Yes / no response request",
  LEGACY_PLAYERPOOL_MESSAGE: "Earlier PlayerPool message",
};
function date(value: string | Date) {
  return formatDateTimeInLondon(new Date(value), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export default function PlayerPoolContactHistory({ events, replyAt, declinedAt, prospectId, block }: {
  events: ContactEvent[]; replyAt: Date | null; declinedAt: Date | null; prospectId: string; block: string | null;
}) {
  return <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65" aria-label="PlayerPool contact history">
    <h4 className="font-bold text-white">Contact history — invitations, chases and replies</h4>
    {declinedAt ? <p className="mt-2 text-emerald-200">Player said no on {date(declinedAt)}. Enquiry closed; reminders stopped.</p>
      : replyAt ? <p className="mt-2 text-amber-200">Reply received {date(replyAt)} — review before sending anything else.</p> : null}
    {block ? <p className="mt-2">Response chase: {block}.</p> : null}
    {events.length ? <details className="mt-2" open={events.length <= 3}>
      <summary className="cursor-pointer font-semibold">{events.length} recorded message{events.length === 1 ? "" : "s"}</summary>
      <ul className="mt-2 space-y-2">{events.slice(0, 12).map(e => <li key={e.id} className="rounded-lg border border-white/5 p-2">
        <div className="font-semibold text-white/85">{labels[e.kind] || "PlayerPool message"} · {e.channel} · {e.status}</div>
        <div>{e.sentAt ? `Sent ${date(e.sentAt)} (provider accepted; not proof it was read)`
          : e.status === "QUEUED" && e.scheduledFor ? `Queued for ${date(e.scheduledFor)} — not sent yet`
          : `Recorded ${date(e.at)} — no successful send recorded`}</div>
        <div className="break-words text-white/45">{e.by}</div>
      </li>)}</ul>
      {events.length > 12 ? <p className="mt-2">Latest 12 shown. Full history is in Player comms.</p> : null}
    </details> : <p className="mt-2">No matching delivery records found. An invitation date alone does not prove an email was sent.</p>}
    <Link href={`/admin/player-prospects/${prospectId}/communications`} className="mt-2 inline-block font-semibold text-emerald-200 underline">Review Player comms</Link>
  </section>;
}
