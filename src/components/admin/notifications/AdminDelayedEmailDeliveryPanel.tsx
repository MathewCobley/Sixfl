import Link from "next/link";

import {
  listUnresolvedEmailDelays,
  type UnresolvedEmailDelay,
} from "@/lib/notifications/delivery-issues";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function sourceHref(issue: UnresolvedEmailDelay) {
  if (!issue.sourceId) return null;
  if (issue.sourceType === "TEAM") return `/admin/teams/${issue.sourceId}`;
  if (issue.sourceType === "LEAD") return `/admin/leads/${issue.sourceId}`;
  if (issue.sourceType === "REFEREE") return `/admin/referees/${issue.sourceId}`;
  if (issue.sourceType === "USER") return `/admin/users/${issue.sourceId}`;
  if (issue.sourceType === "TEAM_PLAYER_PROSPECT") {
    return `/admin/player-prospects/${issue.sourceId}/communications`;
  }
  return null;
}

export default async function AdminDelayedEmailDeliveryPanel() {
  const delayed = await listUnresolvedEmailDelays(100);

  if (delayed.length === 0) return null;

  return (
    <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/75">
            Temporary delivery warnings
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {delayed.length} delayed email{delayed.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">
            These messages have not permanently failed. Resend is still trying because the
            receiving mail server reported a temporary problem. An item disappears from this
            list when a later delivered, bounced, failed or suppressed event is received.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {delayed.map((issue) => {
          const href = sourceHref(issue);

          return (
            <article
              key={issue.dispatchId}
              className="rounded-2xl border border-amber-200/15 bg-black/25 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {issue.displayName || issue.email || "Unknown recipient"}
                  </div>
                  <div className="mt-1 break-all text-sm text-white/55">
                    {issue.email || "No email address saved"}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-white/75">
                    {issue.subject || "Email with no subject"}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-amber-100/65">
                    {issue.reason || "Delivery temporarily delayed"} · {formatDate(issue.attemptedAt)}
                  </div>
                </div>

                {href ? (
                  <Link
                    href={href}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
                  >
                    Open record
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
