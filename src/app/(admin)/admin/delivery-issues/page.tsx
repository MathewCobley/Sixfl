// ========================================
// File: src/app/(admin)/admin/delivery-issues/page.tsx
// ========================================

import Link from "next/link";
import {
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

import { resolveDeliveryIssueAction } from "@/app/(admin)/admin/delivery-issues/actions";
import {
  normalizeEmailAddress,
  suggestEmailCorrection,
} from "@/lib/notifications/email-health";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Delivery Issues | SIXFL Admin",
};

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
  recipient?: string | string[];
  sourceUpdated?: string | string[];
};

type RecipientMetadata = Record<string, Prisma.JsonValue>;

type FailedDispatch = {
  id: string;
  subject: string | null;
  failureReason: string | null;
  failedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  sourceType: string | null;
  sourceId: string | null;
};

type DeliveryRecipient = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  displayName: string | null;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  isSuppressed: boolean;
  suppressionReason: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  dispatches: FailedDispatch[];
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

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

function metadataRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as RecipientMetadata;
  }

  return value as RecipientMetadata;
}

function metadataString(
  value: Prisma.JsonValue | null | undefined,
  key: string,
) {
  const candidate = metadataRecord(value)[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function metadataBoolean(
  value: Prisma.JsonValue | null | undefined,
  key: string,
) {
  const candidate = metadataRecord(value)[key];
  return typeof candidate === "boolean" ? candidate : null;
}

function metadataDate(
  value: Prisma.JsonValue | null | undefined,
  key: string,
) {
  const raw = metadataString(value, key);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dispatchFailureAt(dispatch: FailedDispatch) {
  return dispatch.failedAt ?? dispatch.updatedAt ?? dispatch.createdAt;
}

function sourceHref(recipient: DeliveryRecipient) {
  const sourceId = recipient.sourceId?.trim() || null;

  if (recipient.sourceType === "TEAM" && sourceId) {
    return `/admin/teams/${sourceId}`;
  }
  if (recipient.sourceType === "LEAD" && sourceId) {
    return `/admin/leads/${sourceId}`;
  }
  if (recipient.sourceType === "REFEREE" && sourceId) {
    return `/admin/referees/${sourceId}`;
  }
  if (recipient.sourceType === "USER" && sourceId) {
    return `/admin/users/${sourceId}`;
  }

  const prospectId = metadataString(recipient.metadata, "prospectId");
  const teamMemberId = metadataString(recipient.metadata, "teamMemberId");
  const teamId = metadataString(recipient.metadata, "teamId");
  const refereeUserId = metadataString(recipient.metadata, "refereeUserId");
  const userId = refereeUserId ?? metadataString(recipient.metadata, "userId");
  const leadId =
    metadataString(recipient.metadata, "interestLeadId") ??
    metadataString(recipient.metadata, "leadId");

  if (prospectId) {
    return `/admin/player-prospects/${prospectId}/communications`;
  }
  if (teamMemberId && teamId) {
    return `/admin/teams/${teamId}/players/${teamMemberId}/communications`;
  }
  if (userId) {
    return refereeUserId
      ? `/admin/referees/${userId}`
      : `/admin/users/${userId}`;
  }
  if (leadId) {
    return `/admin/leads/${leadId}`;
  }
  if (teamId) {
    return `/admin/teams/${teamId}`;
  }

  if (recipient.sourceType === "PLAYER") {
    return "/admin/player-prospects";
  }

  return null;
}

function sourceLabel(recipient: DeliveryRecipient) {
  const entityType = metadataString(recipient.metadata, "entityType");
  if (entityType === "TEAM_PLAYER_PROSPECT") return "PLAYER PROSPECT";
  if (entityType === "PLAYER_MATCH_FEE") return "PLAYER PAYMENT";
  return recipient.sourceType;
}

function getNotice(input: SearchParams) {
  const notice = getSearchParam(input.notice);
  const recipient = getSearchParam(input.recipient) ?? "Recipient";
  const sourceUpdated = getSearchParam(input.sourceUpdated) !== "0";

  if (notice === "resolved_and_retried") {
    return {
      tone: "success" as const,
      message: `${recipient}'s email issue was resolved and a replacement email was queued.`,
      detail: sourceUpdated
        ? "The source record and messaging recipient were updated together."
        : "The messaging recipient was updated, but no linked source record could be identified automatically.",
    };
  }

  if (notice === "resolved") {
    return {
      tone: sourceUpdated ? ("success" as const) : ("warning" as const),
      message: `${recipient}'s email issue was resolved.`,
      detail: sourceUpdated
        ? "The source record and messaging recipient were updated together."
        : "The messaging recipient was updated, but no linked source record could be identified automatically. Open the source record and verify it manually.",
    };
  }

  return null;
}

function getErrorMessage(input: SearchParams) {
  switch (getSearchParam(input.error)) {
    case "missing_recipient":
      return "The delivery recipient was missing.";
    case "invalid_email":
      return "Enter a complete, valid email address.";
    case "confirmation_required":
      return "Confirm that you have checked the corrected email with the contact.";
    case "recipient_not_found":
      return "That delivery recipient could not be found.";
    case "resend_confirmation_required":
      return "This is the same suppressed address. Remove it from Resend's Suppressions list first, then tick the confirmation box.";
    case "email_in_use":
      return "That email address already belongs to another SIXFL user account.";
    case "source_not_found":
      return "The linked team, lead, player, referee or user record could not be found.";
    case "retry_not_available":
      return "The failed email selected for retry is no longer available.";
    case "retry_already_queued":
      return "A replacement for that failed email has already been queued.";
    case "save_failed":
      return "The email correction could not be saved. Nothing was partially updated.";
    default:
      return null;
  }
}

function Notice({
  tone,
  message,
  detail,
}: {
  tone: "success" | "warning" | "error";
  message: string;
  detail?: string;
}) {
  const classes =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-50"
      : tone === "warning"
        ? "border-amber-400/25 bg-amber-500/10 text-amber-50"
        : "border-red-400/25 bg-red-500/10 text-red-50";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>
      <div className="font-semibold">{message}</div>
      {detail ? <div className="mt-1 text-xs opacity-75">{detail}</div> : null}
    </div>
  );
}

function ResolutionSummary({ recipient }: { recipient: DeliveryRecipient }) {
  const oldEmail = metadataString(recipient.metadata, "deliveryIssueOldEmail");
  const newEmail =
    metadataString(recipient.metadata, "deliveryIssueNewEmail") ??
    recipient.email;
  const resolvedAt = metadataDate(
    recipient.metadata,
    "deliveryIssueResolvedAt",
  );
  const sourceUpdated = metadataBoolean(
    metadataRecord(recipient.metadata).deliveryIssueResolution ?? null,
    "sourceRecordUpdated",
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-white">
            {recipient.displayName || newEmail || "Unnamed recipient"}
          </div>
          <div className="mt-1 break-all text-sm text-white/55">
            {oldEmail && oldEmail !== newEmail ? `${oldEmail} → ${newEmail}` : newEmail}
          </div>
        </div>
        <div className="text-xs text-white/40">
          Resolved {formatDate(resolvedAt)}
        </div>
      </div>
      {sourceUpdated === false ? (
        <div className="mt-3 text-xs text-amber-200/80">
          Source record still needs a manual check.
        </div>
      ) : null}
    </div>
  );
}

export default async function DeliveryIssuesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const notice = getNotice(sp);
  const errorMessage = getErrorMessage(sp);

  const rawRecipients: DeliveryRecipient[] =
    await prisma.notificationRecipient.findMany({
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
          orderBy: [
            { failedAt: "desc" },
            { updatedAt: "desc" },
            { createdAt: "desc" },
          ],
          take: 10,
          select: {
            id: true,
            subject: true,
            failureReason: true,
            failedAt: true,
            updatedAt: true,
            createdAt: true,
            sourceType: true,
            sourceId: true,
          },
        },
      },
      take: 250,
    });

  const issueRows = rawRecipients
    .map((recipient) => {
      const resolvedAt = metadataDate(
        recipient.metadata,
        "deliveryIssueResolvedAt",
      );
      const openDispatches = recipient.dispatches.filter((dispatch) => {
        if (!resolvedAt) return true;
        return dispatchFailureAt(dispatch).getTime() > resolvedAt.getTime();
      });

      return {
        recipient,
        latest: openDispatches[0] ?? null,
        hasOpenIssue: recipient.isSuppressed || openDispatches.length > 0,
      };
    })
    .filter((row) => row.hasOpenIssue);

  const recentlyResolved = rawRecipients
    .filter((recipient) => {
      const resolvedAt = metadataDate(
        recipient.metadata,
        "deliveryIssueResolvedAt",
      );
      if (!resolvedAt || recipient.isSuppressed) return false;
      return !recipient.dispatches.some(
        (dispatch) =>
          dispatchFailureAt(dispatch).getTime() > resolvedAt.getTime(),
      );
    })
    .sort(
      (a, b) =>
        (metadataDate(b.metadata, "deliveryIssueResolvedAt")?.getTime() ?? 0) -
        (metadataDate(a.metadata, "deliveryIssueResolvedAt")?.getTime() ?? 0),
    )
    .slice(0, 8);

  const suppressedCount = issueRows.filter(
    ({ recipient }) => recipient.isSuppressed,
  ).length;
  const typoCount = issueRows.filter(({ recipient }) =>
    suggestEmailCorrection(recipient.emailNormalized ?? recipient.email),
  ).length;
  const retryableCount = issueRows.filter(({ latest }) => latest).length;

  return (
    <div className="space-y-7 pb-12">
      <section className="rounded-3xl border border-red-400/20 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/75">
              Email health
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Delivery issues
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
              Correct the address here, update its linked SIXFL record, clear the local block and optionally retry the most recent failed email.
            </p>
          </div>
          <a
            href="https://resend.com/emails"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            Open Resend
          </a>
        </div>
      </section>

      {notice ? <Notice {...notice} /> : null}
      {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.055] p-5 text-sm leading-6 text-amber-50/85">
        <div className="font-semibold text-amber-50">
          When Resend needs a manual step
        </div>
        <p className="mt-1">
          If the email address is changing, the old incorrect address can remain suppressed in Resend and the corrected address can be used immediately. If you are keeping the exact same address, first remove it from Resend&apos;s Suppressions list, then tick the confirmation on that record below.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Open issues
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {issueRows.length}
          </div>
          <div className="mt-1 text-sm text-white/45">
            People or team contacts
          </div>
        </div>
        <div className="rounded-3xl border border-red-400/15 bg-red-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100/45">
            Suppressed
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {suppressedCount}
          </div>
          <div className="mt-1 text-sm text-white/45">
            Future email blocked
          </div>
        </div>
        <div className="rounded-3xl border border-amber-400/15 bg-amber-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/45">
            Likely typos
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {typoCount}
          </div>
          <div className="mt-1 text-sm text-white/45">
            Suggested corrections
          </div>
        </div>
        <div className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/45">
            Retry available
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {retryableCount}
          </div>
          <div className="mt-1 text-sm text-white/45">
            Latest failed email retained
          </div>
        </div>
      </div>

      {issueRows.length === 0 ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-8 text-sm text-emerald-100">
          No unresolved failed or suppressed email recipients are currently recorded.
        </section>
      ) : (
        <div className="space-y-5">
          {issueRows.map(({ recipient, latest }) => {
            const href = sourceHref(recipient);
            const currentEmail = normalizeEmailAddress(
              recipient.emailNormalized ?? recipient.email,
            );
            const suggestion = suggestEmailCorrection(currentEmail);
            const reason =
              recipient.suppressionReason ||
              latest?.failureReason ||
              "Email delivery failed.";

            return (
              <section
                key={recipient.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_18px_55px_rgba(0,0,0,0.22)]"
              >
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="min-w-0 space-y-4 p-5 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                            {sourceLabel(recipient)}
                          </span>
                        </div>
                        <div className="mt-3 break-all text-base font-medium text-white">
                          {currentEmail || "No email saved"}
                        </div>
                        {suggestion ? (
                          <div className="mt-2 text-sm text-amber-200">
                            Suggested correction: <strong>{suggestion}</strong>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08]"
                          >
                            Open source record
                          </Link>
                        ) : null}
                        {recipient.phone ? (
                          <a
                            href={`tel:${recipient.phone}`}
                            className="inline-flex min-h-10 items-center rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15"
                          >
                            Call contact
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-red-400/15 bg-red-500/[0.06] p-4 text-sm leading-6 text-red-50/85">
                      <strong>Reason:</strong> {reason}
                      <div className="mt-1 text-xs text-white/45">
                        Last failed: {formatDate(latest ? dispatchFailureAt(latest) : recipient.updatedAt)}
                        {latest?.subject ? ` · ${latest.subject}` : ""}
                      </div>
                    </div>

                    {latest ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          Email available to retry
                        </div>
                        <div className="mt-2 font-medium text-white/80">
                          {latest.subject || "Email without a subject label"}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          A new dispatch will be created; the failed record remains in the audit history.
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-white/10 bg-black/20 p-5 sm:p-6 xl:border-l xl:border-t-0">
                    <form action={resolveDeliveryIssueAction} className="space-y-4">
                      <input type="hidden" name="recipientId" value={recipient.id} />
                      <input
                        type="hidden"
                        name="retryDispatchId"
                        value={latest?.id ?? ""}
                      />

                      <div>
                        <label
                          htmlFor={`email-${recipient.id}`}
                          className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45"
                        >
                          Correct email address
                        </label>
                        <input
                          id={`email-${recipient.id}`}
                          type="email"
                          name="email"
                          required
                          defaultValue={suggestion ?? currentEmail}
                          placeholder="name@example.com"
                          className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                        />
                        <p className="mt-2 text-xs leading-5 text-white/40">
                          This updates the linked SIXFL record where one can be identified, then synchronises the messaging address.
                        </p>
                      </div>

                      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/70">
                        <input
                          type="checkbox"
                          name="confirmValidAddress"
                          required
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40"
                        />
                        <span>
                          I have checked this address with the contact or against a reliable source.
                        </span>
                      </label>

                      {recipient.isSuppressed ? (
                        <label className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-3 text-sm text-amber-50/80">
                          <input
                            type="checkbox"
                            name="confirmedResendRemoval"
                            className="mt-1 h-4 w-4 rounded border-amber-300/30 bg-black/40"
                          />
                          <span>
                            I am keeping the exact same address and have removed it from Resend&apos;s Suppressions list. Leave this unticked when changing the address.
                          </span>
                        </label>
                      ) : null}

                      {latest ? (
                        <label className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/[0.07] p-3 text-sm text-sky-50/80">
                          <input
                            type="checkbox"
                            name="retryLatest"
                            className="mt-1 h-4 w-4 rounded border-sky-300/30 bg-black/40"
                          />
                          <span>
                            Queue a replacement copy of the latest failed email after saving.
                          </span>
                        </label>
                      ) : null}

                      <button
                        type="submit"
                        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300"
                      >
                        Save correction &amp; clear issue
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {recentlyResolved.length > 0 ? (
        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Recently resolved
            </h2>
            <p className="mt-1 text-sm text-white/45">
              These old failures are retained for audit but no longer count as open issues.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {recentlyResolved.map((recipient) => (
              <ResolutionSummary key={recipient.id} recipient={recipient} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
