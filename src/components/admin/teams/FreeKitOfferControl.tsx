import { Prisma } from "@prisma/client";

import { updateManualFreeKitOfferAction } from "@/app/(admin)/admin/teams/[id]/free-kit-actions";
import { prisma } from "@/lib/prisma";

const INCLUDED_KITS = 7;
const EXTRA_KIT_PRICE = "£20";

type OfferState = {
  wantsFreeKit: boolean;
  leadWantsFreeKit: boolean;
};

type AuditRow = {
  previousValue: boolean;
  newValue: boolean;
  reason: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
};

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

export default async function FreeKitOfferControl({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const [stateRows, auditRows] = await Promise.all([
    prisma.$queryRaw<OfferState[]>(Prisma.sql`
      SELECT
        COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = team."id"
            AND lead."wantsFreeKit" = TRUE
        ) AS "leadWantsFreeKit"
      FROM "Team" team
      WHERE team."id" = ${teamId}
      LIMIT 1
    `),
    prisma.$queryRaw<AuditRow[]>(Prisma.sql`
      SELECT
        audit."previousValue",
        audit."newValue",
        audit."reason",
        audit."createdAt",
        actor."name" AS "actorName",
        actor."email" AS "actorEmail"
      FROM "TeamFreeKitOfferAudit" audit
      LEFT JOIN "User" actor ON actor."id" = audit."actorUserId"
      WHERE audit."teamId" = ${teamId}
      ORDER BY audit."createdAt" DESC
      LIMIT 3
    `).catch(() => [] as AuditRow[]),
  ]);

  const state = stateRows[0] ?? { wantsFreeKit: false, leadWantsFreeKit: false };
  const effectiveOffer = state.wantsFreeKit || state.leadWantsFreeKit;
  const manualOnly = state.wantsFreeKit && !state.leadWantsFreeKit;

  return (
    <section className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">
            Free kit offer
          </div>
          <h3 className="mt-1 text-base font-semibold text-white">
            {effectiveOffer
              ? `✓ ${INCLUDED_KITS} complete kits included free`
              : "No free kit offer"}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            {effectiveOffer
              ? `The team can order ${INCLUDED_KITS} complete kits free of charge. Any additional complete kits cost ${EXTRA_KIT_PRICE} each.`
              : `Grant this team the SIXFL founding-team allocation of ${INCLUDED_KITS} complete kits free of charge. Additional complete kits remain ${EXTRA_KIT_PRICE} each.`}
          </p>
        </div>
        <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
          effectiveOffer
            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
            : "border-white/10 bg-white/[0.04] text-white/50"
        }`}>
          {state.leadWantsFreeKit
            ? "Original registration"
            : state.wantsFreeKit
              ? "Manually granted"
              : "Not eligible"}
        </span>
      </div>

      {!effectiveOffer ? (
        <details className="mt-4 rounded-xl border border-emerald-400/20 bg-black/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-emerald-200">
            Grant free kit offer
          </summary>
          <form action={updateManualFreeKitOfferAction} className="mt-4 space-y-3">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="enabled" value="true" />
            <label className="block text-sm text-white/70">
              Admin note (optional)
              <input
                name="reason"
                maxLength={500}
                placeholder={`Why ${teamName} is being given the offer`}
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/40"
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-emerald-400/15 p-3 text-sm text-white/70">
              <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
              <span>I confirm SIXFL is granting {teamName} {INCLUDED_KITS} complete kits free of charge.</span>
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              Grant {INCLUDED_KITS} free kits
            </button>
            <p className="text-xs leading-5 text-white/45">This does not send an email or alter the team&apos;s league, squad, fixtures or match payments.</p>
          </form>
        </details>
      ) : null}

      {state.leadWantsFreeKit ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55">
          This entitlement came from the team&apos;s original registration and is therefore not removable from this manual override control.
        </div>
      ) : null}

      {manualOnly ? (
        <details className="mt-4 rounded-xl border border-red-400/20 bg-black/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-200">
            Remove manually granted offer
          </summary>
          <form action={updateManualFreeKitOfferAction} className="mt-4 space-y-3">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="enabled" value="false" />
            <label className="block text-sm text-white/70">
              Admin note (optional)
              <input
                name="reason"
                maxLength={500}
                placeholder="Reason for removing the manual offer"
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-red-400/40"
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-red-400/15 p-3 text-sm text-white/70">
              <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
              <span>I confirm the manual free-kit entitlement should be removed.</span>
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
            >
              Remove manual offer
            </button>
            <p className="text-xs leading-5 text-white/45">Removal is blocked once a live kit order or additional-kit charge exists, so an active order cannot accidentally lose its entitlement.</p>
          </form>
        </details>
      ) : null}

      {auditRows.length ? (
        <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-white/55">Manual offer history</summary>
          <div className="mt-3 space-y-2">
            {auditRows.map((row, index) => (
              <div key={`${row.createdAt.toISOString()}-${index}`} className="text-xs leading-5 text-white/50">
                <span className="font-semibold text-white/70">{row.newValue ? "Granted" : "Removed"}</span>
                {` · ${formatDate(row.createdAt)} · ${row.actorName || row.actorEmail || "Admin"}`}
                {row.reason ? ` · ${row.reason}` : ""}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
