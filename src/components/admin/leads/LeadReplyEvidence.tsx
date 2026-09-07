import Link from "next/link";
import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import { leadConversationHref, type LeadCommunicationEvidence } from "@/lib/leads/communication-evidence";

function when(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }).format(value);
}
export default function LeadReplyEvidence({ evidence }: { evidence: LeadCommunicationEvidence }) {
  const reply = evidence.latestReply;
  if (!reply && !evidence.reviewAt) return null;
  return (
    <section id="lead-reply-evidence" className="scroll-mt-6 space-y-4 rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.07] p-5 sm:p-6">
      {reply ? <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Latest incoming reply</h2>
            <p className="mt-2 text-sm text-emerald-100">{reply.channel} · INBOUND · {when(reply.occurredAt)} (UK)</p>
            <p className="mt-1 break-all text-xs text-white/65">From {reply.from}</p>
          </div>
          <Link href={leadConversationHref(reply.threadId)} className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100">View conversation</Link>
        </div>
        {reply.subject ? <p className="font-semibold text-white">{reply.subject}</p> : null}
        {reply.body.trim() ? <blockquote className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/25 p-4 text-sm leading-6 text-white/90">{reply.body}</blockquote>
          : reply.htmlBody ? <EmailHtmlPreview html={reply.htmlBody} /> : null}
        <p className="text-xs leading-5 text-white/60">This is an incoming message, not a delivery receipt or confirmation of a team place. Opening this page does not send a message or restart the chase.</p>
      </> : null}
      {evidence.reviewAt ? <div className="space-y-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
        <h3 className="font-semibold">Reply record needs checking</h3>
        <p>There is an incoming timestamp or linked conversation that cannot be verified against a message from this lead. It is not proof that they replied. Any existing automatic chase hold is preserved.</p>
        <p className="text-xs">Record dated {when(evidence.reviewAt)} (UK).</p>
        <div className="flex flex-wrap gap-3">{evidence.reviewThreadIds.map((id, index) => <Link key={id} href={leadConversationHref(id)} className="underline underline-offset-4">Review linked conversation{evidence.reviewThreadIds.length > 1 ? ` ${index + 1}` : ""}</Link>)}</div>
      </div> : null}
    </section>
  );
}
