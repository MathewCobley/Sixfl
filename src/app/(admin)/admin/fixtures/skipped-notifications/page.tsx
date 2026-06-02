// ========================================
// File: src/app/(admin)/admin/fixtures/skipped-notifications/page.tsx
// ========================================

import Link from "next/link";
import { NotificationDispatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getMetadataString(
  metadata: unknown,
  key: "teamName" | "fixtureName" | "leagueName",
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRecipientLabel(item: {
  recipient: {
    displayName: string | null;
    email: string | null;
    phone: string | null;
  };
  metadata: unknown;
}) {
  return (
    getMetadataString(item.metadata, "teamName") ||
    item.recipient.displayName ||
    item.recipient.email ||
    item.recipient.phone ||
    "Unknown team/contact"
  );
}

function getTypeLabel(sourceType: string | null) {
  switch (sourceType) {
    case "LEAGUE_FIXTURE_DIGEST":
      return "Fixture digest";
    case "FIXTURE_REMINDER":
      return "Fixture reminder";
    default:
      return sourceType || "Notification";
  }
}

export default async function SkippedFixtureNotificationsPage() {
  await requireAdmin();

  const skipped = await prisma.notificationDispatch.findMany({
    where: {
      status: NotificationDispatchStatus.SKIPPED,
      sourceType: {
        in: ["LEAGUE_FIXTURE_DIGEST", "FIXTURE_REMINDER"],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      sourceType: true,
      subject: true,
      metadata: true,
      failureReason: true,
      scheduledFor: true,
      createdAt: true,
      recipient: {
        select: {
          displayName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  return (
    <div className="space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Fixture publishing
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Skipped fixture notifications
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Shows fixture digest and reminder emails that were skipped, including the team/contact and the reason.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/fixtures"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Back to fixtures
            </Link>
            <Link
              href="/admin/queue?filter=skipped"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Open full queue
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Latest skipped fixture emails
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {skipped.length} skipped notification{skipped.length === 1 ? "" : "s"}
            </h2>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {skipped.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No skipped fixture notifications found.
            </div>
          ) : null}

          {skipped.map((item) => {
            const fixtureName = getMetadataString(item.metadata, "fixtureName");
            const leagueName = getMetadataString(item.metadata, "leagueName");

            return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        {getTypeLabel(item.sourceType)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        Skipped
                      </span>
                    </div>

                    <h3 className="mt-3 text-sm font-semibold text-white">
                      {getRecipientLabel(item)}
                    </h3>
                    {fixtureName ? (
                      <p className="mt-1 text-sm text-white/60">{fixtureName}</p>
                    ) : null}
                    {leagueName ? (
                      <p className="mt-1 text-xs text-white/45">{leagueName}</p>
                    ) : null}
                    <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {item.failureReason || "Already queued, processing or sent."}
                    </p>
                  </div>

                  <div className="grid gap-2 text-xs text-white/45 sm:grid-cols-2 lg:w-[440px]">
                    <div>Created: {formatDateTime(item.createdAt)}</div>
                    <div>Scheduled: {formatDateTime(item.scheduledFor)}</div>
                    <div>Email: {item.recipient.email || "—"}</div>
                    <div>Phone: {item.recipient.phone || "—"}</div>
                    <div className="sm:col-span-2">Subject: {item.subject || "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
