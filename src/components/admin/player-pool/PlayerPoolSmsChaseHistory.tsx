import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { profileSmsPlan, type ProfileSmsDispatch, type ProfileSmsHistory } from "@/lib/player-pool/profile-sms-policy";

function date(value: Date | null) {
  return value ? formatDateTimeInLondon(value, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "time not recorded";
}
function ChaseRow({ label, dispatch }: { label: string; dispatch: ProfileSmsDispatch | null }) {
  let detail = "Not sent";
  if (dispatch) {
    switch (dispatch.status) {
      case "SENT": detail = `Sent: ${date(dispatch.sentAt)}`; break;
      case "QUEUED": detail = `Queued — scheduled for ${date(dispatch.scheduledFor)}`; break;
      case "PROCESSING": detail = "Sending — awaiting confirmation"; break;
      case "FAILED": detail = `Failed: ${date(dispatch.failedAt)}`; break;
      case "SKIPPED": detail = "Skipped — not sent"; break;
      case "CANCELLED": detail = "Cancelled — not sent"; break;
      default: detail = dispatch.status.replaceAll("_", " ");
    }
  }
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
    <dt className="font-semibold text-white/80">{label}</dt>
    <dd className="mt-1 text-white/60">
      {dispatch ? <Link href={`/admin/queue/${encodeURIComponent(dispatch.id)}`} className="underline decoration-white/25 underline-offset-2 hover:text-white">{detail}</Link> : detail}
      {dispatch?.status === "FAILED" && dispatch.sentAt && <span className="mt-1 block">Sent to provider: {date(dispatch.sentAt)}</span>}
      {dispatch?.failureReason && <span className="mt-1 block break-words text-amber-200/80">{dispatch.failureReason}</span>}
    </dd>
  </div>;
}
export default function PlayerPoolSmsChaseHistory({ profile, history, now = new Date() }: {
  profile: { status: string; profileSubmittedAt: Date | null; phone: string | null };
  history: ProfileSmsHistory;
  now?: Date;
}) {
  const plan = profileSmsPlan(profile, history);
  return <section className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs" aria-label="SMS profile chase history">
    <h4 className="font-bold text-white/80">SMS profile chases</h4>
    <dl className="grid gap-2 sm:grid-cols-2">
      <ChaseRow label="First SMS chase" dispatch={history.first} />
      <ChaseRow label="Second / final SMS chase" dispatch={history.final} />
    </dl>
    <p className="leading-5 text-white/50">{plan.note}</p>
    {plan.dueAt && <p className="leading-5 text-emerald-200/80">
      {plan.stage === "first" ? "First chase due" : "Second chase due"}: {date(plan.dueAt)}.
      {plan.dueAt <= now ? " Due for the next scheduled check." : ""} Normal SMS sending hours apply.
    </p>}
    {(history.first || history.final) && <p className="text-[11px] leading-4 text-white/40">Times are UK time. Sent means accepted by the SMS provider; it is not confirmation that the player has read it.</p>}
  </section>;
}
