import { Suspense } from "react";
import Link from "next/link";
import { Prisma } from "@prisma/client";

import { updateManualFreeKitOfferAction } from "@/app/(admin)/admin/teams/[id]/free-kit-actions";
import { getTeamFreeKitOffer } from "@/lib/kits/free-kit-offer";
import { prisma } from "@/lib/prisma";
import FreeKitOfferFeedback, { FreeKitOfferSubmitButton } from "./FreeKitOfferFeedback";

type AuditRow = {
  newValue: boolean;
  reason: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
};
function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(value);
}

export default async function FreeKitOfferControl({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [state, auditRows] = await Promise.all([
    getTeamFreeKitOffer(teamId),
    prisma.$queryRaw<AuditRow[]>(Prisma.sql`
      SELECT audit."newValue", audit."reason", audit."createdAt", actor."name" AS "actorName", actor."email" AS "actorEmail"
      FROM "TeamFreeKitOfferAudit" audit
      LEFT JOIN "User" actor ON actor."id" = audit."actorUserId"
      WHERE audit."teamId" = ${teamId} ORDER BY audit."createdAt" DESC LIMIT 5
    `).catch(() => [] as AuditRow[]),
  ]);
  if (!state) return null;
  const enabled = state.enabled;
  const nextEnabled = !enabled;
  const inUse = state.hasExistingOrder || state.hasKitCharges;
  const source = state.leadWantsFreeKit ? "Original registration" : state.wantsFreeKit ? "Manually granted" : "No allocation";

  return (
    <section id="free-kit-offer" className="mb-6 scroll-mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4 sm:p-5">
      <Suspense fallback={null}><FreeKitOfferFeedback /></Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">Free kit offer</div>
          <h3 className="mt-1 text-base font-semibold text-white">{enabled ? "✓ 7 complete kits included free" : state.expiredAt ? "Free kit offer turned off" : "No free kit offer"}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            {enabled ? "The team can order 7 complete kits free of charge. Any additional complete kits cost £20 each." : state.includedEligible ? "The offer is off. The allocation attached to the existing kit order is preserved; review that order separately in Admin Kits." : "There is no current free-kit allocation. The team can still order complete kits for £20 each."}
          </p>
        </div>
        <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${enabled ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/60"}`}>
          {state.expiredAt ? "Off — admin override" : source}
        </span>
      </div>
      {state.leadWantsFreeKit ? <p className="mt-3 text-xs leading-5 text-white/55">The original registration included the offer. You can turn it off here without changing the original registration record.</p> : null}
      {state.expiredAt ? <p className="mt-3 text-xs leading-5 text-white/55">Turned off {formatDate(state.expiredAt)}.{state.reason ? ` ${state.reason}` : ""}</p> : null}
      {inUse ? <p className="mt-4 rounded-xl border border-amber-400/20 bg-black/20 p-3 text-sm leading-6 text-amber-100">A kit order or kit payment already exists. <Link href="/admin/kits" className="font-semibold underline">Review it in Admin Kits</Link> before changing this offer. Existing orders and payments are protected.</p> : null}
      <details className={`mt-4 rounded-xl border bg-black/20 p-4 ${enabled ? "border-red-400/20" : "border-emerald-400/20"}`}>
        <summary className={`cursor-pointer text-sm font-semibold ${enabled ? "text-red-200" : "text-emerald-200"}`}>{enabled ? "Turn off free kit offer" : "Turn on free kit offer"}</summary>
        <form action={updateManualFreeKitOfferAction} className="mt-4 space-y-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="enabled" value={String(nextEnabled)} />
          <input type="hidden" name="expectedRevision" value={state.revision} />
          <label className="block text-sm text-white/70">{enabled ? "Reason for turning the offer off" : "Admin note (optional)"}
            <input name="reason" required={enabled} maxLength={500} placeholder={enabled ? "For example, the team no longer requires the offer" : `Why ${teamName} is being given the offer`} className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/40" />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/70">
            <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
            <span>{enabled ? `I confirm the free-kit offer should be turned off for ${teamName}.` : `I confirm SIXFL is granting ${teamName} 7 complete kits free of charge.`}</span>
          </label>
          <FreeKitOfferSubmitButton enabled={nextEnabled} />
          <p className="text-xs leading-5 text-white/45">This records an admin override and does not send an email, alter the original registration or change league, squad, fixture or match-payment records. Kit orders and payments are never cancelled or repriced by this control.</p>
        </form>
      </details>
      {auditRows.length ? <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-white/55">Offer change history</summary>
        <div className="mt-3 space-y-2">{auditRows.map((row, index) => <div key={`${row.createdAt.toISOString()}-${index}`} className="text-xs leading-5 text-white/50"><span className="font-semibold text-white/70">{row.newValue ? "Turned on / granted" : "Turned off / removed"}</span>{` · ${formatDate(row.createdAt)} · ${row.actorName || row.actorEmail || "Admin"}`}{row.reason ? ` · ${row.reason}` : ""}</div>)}</div>
      </details> : null}
    </section>
  );
}
