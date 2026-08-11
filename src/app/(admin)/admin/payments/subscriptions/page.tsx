// ========================================
// File: src/app/(admin)/admin/payments/subscriptions/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getTeamAutoPaySnapshot,
  isConfirmedTeamAutoPaySetup,
} from "@/lib/payments/team-autopay-snapshot";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Admin Saved Cards | SIXFL",
};

type SavedCardTeamRow = {
  id: string;
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  autoPayEnabled: boolean;
  autoPayMandateAcceptedAt: Date | null;
  autoPayMandateText: string | null;
  autoPaySetupCheckoutSessionId: string | null;
  autoPayLastAttemptAt: Date | null;
  autoPayLastFailureAt: Date | null;
  autoPayLastFailureReason: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskStripeId(value: string | null) {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 9)}…${value.slice(-4)}`;
}

function hasLocalCompleteEvidence(row: SavedCardTeamRow) {
  return Boolean(
    row.autoPayEnabled &&
      row.stripeCustomerId?.trim() &&
      row.stripeDefaultPaymentMethodId?.trim() &&
      row.autoPayMandateAcceptedAt &&
      row.autoPayMandateText?.trim() &&
      row.autoPaySetupCheckoutSessionId?.trim(),
  );
}

function getStatus(input: {
  confirmed: boolean;
  localComplete: boolean;
  setupStarted: boolean;
  hasLegacySubscription: boolean;
}) {
  if (input.confirmed) {
    return {
      label: "Saved card complete",
      tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    };
  }

  if (input.localComplete) {
    return {
      label: "Stripe verification failed",
      tone: "border-red-400/25 bg-red-500/10 text-red-100",
    };
  }

  if (input.setupStarted) {
    return {
      label: "Setup started — not completed",
      tone: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    };
  }

  if (input.hasLegacySubscription) {
    return {
      label: "Legacy subscription only",
      tone: "border-violet-400/25 bg-violet-500/10 text-violet-100",
    };
  }

  return {
    label: "Not set up",
    tone: "border-white/10 bg-white/[0.05] text-white/60",
  };
}

async function loadSavedCardTeams() {
  return prisma.$queryRaw<SavedCardTeamRow[]>(Prisma.sql`
    SELECT
      team."id",
      team."name",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      team."stripeCustomerId",
      team."stripeDefaultPaymentMethodId",
      team."autoPayEnabled",
      team."autoPayMandateAcceptedAt",
      team."autoPayMandateText",
      team."autoPaySetupCheckoutSessionId",
      team."autoPayLastAttemptAt",
      team."autoPayLastFailureAt",
      team."autoPayLastFailureReason",
      team."stripeSubscriptionId",
      team."subscriptionStatus"
    FROM "Team" team
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    WHERE team."stripeCustomerId" IS NOT NULL
      OR team."stripeDefaultPaymentMethodId" IS NOT NULL
      OR team."autoPaySetupCheckoutSessionId" IS NOT NULL
      OR team."autoPayEnabled" = true
      OR team."stripeSubscriptionId" IS NOT NULL
      OR team."subscriptionStatus" IS NOT NULL
    ORDER BY team."name" ASC
  `);
}

export default async function AdminPaymentSubscriptionsPage() {
  await requireAdmin();

  const teams = await loadSavedCardTeams();
  const snapshots = await Promise.all(
    teams.map(async (team) => {
      const snapshot = await getTeamAutoPaySnapshot(team.id);
      return [team.id, snapshot] as const;
    }),
  );
  const snapshotByTeamId = new Map(snapshots);

  const rows = teams.map((team) => {
    const snapshot = snapshotByTeamId.get(team.id) ?? null;
    const confirmed = isConfirmedTeamAutoPaySetup(snapshot);
    const localComplete = hasLocalCompleteEvidence(team);
    const setupStarted = Boolean(
      team.stripeCustomerId ||
        team.stripeDefaultPaymentMethodId ||
        team.autoPaySetupCheckoutSessionId,
    );
    const hasLegacySubscription = Boolean(
      team.stripeSubscriptionId || team.subscriptionStatus,
    );
    const status = getStatus({
      confirmed,
      localComplete,
      setupStarted,
      hasLegacySubscription,
    });

    return {
      team,
      snapshot,
      confirmed,
      localComplete,
      setupStarted,
      hasLegacySubscription,
      status,
    };
  });

  const completeCount = rows.filter((row) => row.confirmed).length;
  const verificationIssueCount = rows.filter(
    (row) => row.localComplete && !row.confirmed,
  ).length;
  const incompleteCount = rows.filter(
    (row) => row.setupStarted && !row.localComplete,
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
            Payments
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Saved card matchday payments
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            This page shows the actual saved-card setup used for one-off matchday collection. A Stripe customer or an old subscription record is not enough: SIXFL only shows a card as complete when the saved-card mandate and Stripe setup can be verified.
          </p>
        </div>

        <Link
          href="/admin/payments"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07] hover:text-white"
        >
          Back to payments
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Stripe-linked teams
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">{rows.length}</div>
          <p className="mt-2 text-sm text-white/50">Any saved-card, customer or legacy Stripe data.</p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Saved card complete
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">{completeCount}</div>
          <p className="mt-2 text-sm text-emerald-100/75">Verified against Stripe now.</p>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Setup incomplete
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">{incompleteCount}</div>
          <p className="mt-2 text-sm text-amber-100/75">Setup started but mandate evidence is incomplete.</p>
        </div>

        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100/70">
            Verification issue
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">{verificationIssueCount}</div>
          <p className="mt-2 text-sm text-red-100/75">Local record looked complete but Stripe did not verify it.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Team saved-card status</h2>
          <p className="mt-1 text-sm text-white/55">
            These statuses use the same saved-card rules as the captain payment page. Legacy recurring-subscription fields are shown only as audit information and never count as saved-card authorisation.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-sm text-white/55">
              No Stripe-linked teams have been recorded yet.
            </div>
          ) : null}

          {rows.map(({ team, snapshot, confirmed, localComplete, setupStarted, hasLegacySubscription, status }) => {
            const failureReason = snapshot?.autoPayLastFailureReason || team.autoPayLastFailureReason;
            const message = confirmed
              ? "Stripe confirms the completed saved-card setup, successful mandate and attached card. Automatic collection is permitted only for the remaining matchday balance."
              : localComplete
                ? failureReason || "SIXFL has local saved-card fields marked complete, but Stripe did not verify the setup. Automatic collection is blocked."
                : setupStarted
                  ? "The Stripe setup flow has been started, but SIXFL does not yet have all the evidence required to authorise automatic matchday collection."
                  : hasLegacySubscription
                    ? "Legacy recurring-subscription data exists, but it does not authorise the current saved-card matchday payment system."
                    : "No saved-card setup has been started.";

            return (
              <div key={team.id} className="rounded-2xl border border-white/10 bg-[#0d1428] p-4">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/teams/${team.id}`}
                        className="text-base font-semibold text-white transition hover:text-emerald-200"
                      >
                        {team.name}
                      </Link>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-white/55">
                      {team.leagueName
                        ? `${team.leagueName}${team.leagueSeason ? ` · ${team.leagueSeason}` : ""}`
                        : "No league assigned"}
                    </div>

                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
                      confirmed
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/80"
                        : localComplete
                          ? "border-red-400/20 bg-red-500/10 text-red-100/80"
                          : "border-amber-400/20 bg-amber-500/10 text-amber-100/80"
                    }`}>
                      {message}
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-white/45 sm:grid-cols-2 xl:grid-cols-4">
                      <div>Customer: {maskStripeId(team.stripeCustomerId)}</div>
                      <div>Setup session: {maskStripeId(team.autoPaySetupCheckoutSessionId)}</div>
                      <div>Payment method: {maskStripeId(team.stripeDefaultPaymentMethodId)}</div>
                      <div>Auto collection: {confirmed ? "Authorised" : "Blocked"}</div>
                    </div>

                    {hasLegacySubscription ? (
                      <div className="mt-2 text-xs text-violet-200/55">
                        Legacy subscription audit: {team.subscriptionStatus || "record present"} · {maskStripeId(team.stripeSubscriptionId)}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 text-sm text-white/60 sm:grid-cols-3 xl:min-w-[560px] xl:text-right">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                        Mandate accepted
                      </div>
                      <div className="mt-1 text-white/80">
                        {formatDateTime(team.autoPayMandateAcceptedAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                        Last auto attempt
                      </div>
                      <div className="mt-1 text-white/80">
                        {formatDateTime(team.autoPayLastAttemptAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                        Last failure
                      </div>
                      <div className={team.autoPayLastFailureAt ? "mt-1 text-red-200" : "mt-1 text-white/80"}>
                        {formatDateTime(team.autoPayLastFailureAt)}
                      </div>
                    </div>
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
