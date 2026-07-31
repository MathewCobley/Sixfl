// ========================================
// File: src/app/(admin)/admin/delivery-issues/page.tsx
// ========================================

import Link from "next/link";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Delivery Issues | SIXFL Admin",
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function sourceHref(sourceType: string, sourceId: string | null) {
  if (!sourceId) return null;
  if (sourceType === "TEAM") return `/admin/teams/${sourceId}`;
  if (sourceType === "LEAD") return `/admin/leads/${sourceId}`;
  if (sourceType === "PLAYER") return "/admin/player-prospects";
  if (sourceType === "REFEREE") return `/admin/referees/${sourceId}`;
  if (sourceType === "USER") return `/admin/users/${sourceId}`;
  return null;
}

function likelyTypo(email: string | null) {
  if (!email) return null;
  const lower = email.toLowerCase();
  const replacements: Array<[RegExp, string]> = [
    [/\.con$/, ".com"],
    [/@gmal\.com$/, "@gmail.com"],
    [/@gmial\.com$/, "@gmail.com"],
    [/@hotmal\.com$/, "@hotmail.com"],
    [/@outlok\.com$/, "@outlook.com"],
    [/@iclod\.com$/, "@icloud.com"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(lower)) return lower.replace(pattern, replacement);
  }
  return null;
}

export default async function DeliveryIssuesPage() {
  await requireAdmin();

  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      OR: [
        { isSuppressed: true },
        {
          dispatches: {
            some: {
              channel: NotificationChannel.EMAIL,
              status: NotificationDispatchStatus.FAILED,
            },
          },
        },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      dispatches: {
        where: {
          channel: NotificationChannel.EMAIL,
          status: NotificationDispatchStatus.FAILED,
        },
        orderBy: [{ failedAt: "desc" }, { updatedAt: "desc" }],
        take: 3,
        select: {
          id: true,
          subject: true,
          failureReason: true,
          failedAt: true,
          updatedAt: true,
          sourceType: true,
          sourceId: true,
        },
      },
    },
    take: 250,
  });

  const suppressedCount = recipients.filter((recipient) => recipient.isSuppressed).length;
  const typoCount = recipients.filter((recipient) => likelyTypo(recipient.email)).length;

  return (
    <div className="space-y-7 pb-12">
      <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/75">
          Email health
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Delivery issues
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
          Correct invalid addresses before resending sign-in links, payment requests or fixture messages.
          Only remove an address from Resend suppression after confirming that the address is genuinely valid.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Affected</div>
          <div className="mt-2 text-3xl font-semibold text-white">{recipients.length}</div>
          <div className="mt-1 text-sm text-white/45">People or team contacts</div>
        </div>
        <div className="rounded-3xl border border-red-400/15 bg-red-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100/45">Suppressed</div>
          <div className="mt-2 text-3xl font-semibold text-white">{suppressedCount}</div>
          <div className="mt-1 text-sm text-white/45">Future email blocked</div>
        </div>
        <div className="rounded-3xl border border-amber-400/15 bg-amber-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/45">Likely typos</div>
          <div className="mt-2 text-3xl font-semibold text-white">{typoCount}</div>
          <div className="mt-1 text-sm text-white/45">Check these first</div>
        </div>
      </div>

      {recipients.length === 0 ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-8 text-sm text-emerald-100">
          No failed or suppressed email recipients are currently recorded.
        </section>
      ) : (
        <div className="space-y-4">
          {recipients.map((recipient) => {
            const latest = recipient.dispatches[0] ?? null;
            const href = sourceHref(recipient.sourceType, recipient.sourceId);
            const suggestion = likelyTypo(recipient.email);
            const reason = recipient.suppressionReason || latest?.failureReason || "Email delivery failed.";

            return (
              <section key={recipient.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">
                        {recipient.displayName || "Unnamed recipient"}
                      </h2>
                      {recipient.isSuppressed ? (
                        <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-100">
                          Suppressed
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                          Delivery failed
                        </span>
                      )}
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
                        {recipient.sourceType}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Email</div>
                        <div className="mt-2 break-all font-medium text-white">{recipient.email || "No email saved"}</div>
                        {suggestion ? (
                          <div className="mt-2 text-amber-200">Possible correction: <strong>{suggestion}</strong></div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Phone fallback</div>
                        <div className="mt-2 font-medium text-white">{recipient.phone || "No phone number saved"}</div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/[0.06] p-4 text-sm leading-6 text-red-50/85">
                      <strong>Reason:</strong> {reason}
                      <div className="mt-1 text-xs text-white/45">
                        Last failed: {formatDate(latest?.failedAt || latest?.updatedAt || recipient.updatedAt)}
                        {latest?.subject ? ` · ${latest.subject}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">
                    {href ? (
                      <Link href={href} className="inline-flex min-h-11 items-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">
                        Open source record
                      </Link>
                    ) : null}
                    {recipient.phone ? (
                      <a href={`tel:${recipient.phone}`} className="inline-flex min-h-11 items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15">
                        Call contact
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
