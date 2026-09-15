"use client";

import { useId, useState, type ReactNode } from "react";

export default function AbandonmentFeeDecisionFields({ canOverride, children }: {
  canOverride: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [decision, setDecision] = useState("STANDARD");
  if (!canOverride) return <>{children}</>;
  const unchanged = decision === "UNCHANGED";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-3 rounded-xl border border-white/15 bg-black/20 p-4">
        <legend className="px-1 text-sm font-semibold text-white">Match fee decision — SIXFL admin only</legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-white/80">
          <input type="radio" name="feeDecision" value="STANDARD" checked={!unchanged} onChange={() => setDecision("STANDARD")} className="mt-1.5" />
          <span><strong>Apply the normal fee rule</strong><br />For a team-responsible abandonment or confirmed no-show, charge that team both fees and waive or credit the opponent as applicable.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-white/80">
          <input type="radio" name="feeDecision" value="UNCHANGED" checked={unchanged} onChange={() => setDecision("UNCHANGED")} aria-controls={`${id}-override`} className="mt-1.5" />
          <span><strong>Leave both teams’ match fees unchanged</strong><br />Record the abandonment without additional charges, waivers, refunds or team credit. Existing payments, player fees and outstanding balances stay as they are.</span>
        </label>
        {unchanged ? <div id={`${id}-override`} className="space-y-3 border-t border-white/10 pt-3">
          <label className="block text-sm font-semibold text-white">Reason for the fee override
            <textarea name="feeOverrideReason" required minLength={3} maxLength={500} rows={2} placeholder="For example: only two minutes remained, so both teams retain their normal match fee." className="mt-2 w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2.5 text-white outline-none focus:border-emerald-400" />
          </label>
          <p role="status" className="text-sm leading-6 text-emerald-100">Fees will stay unchanged. This does not remove the responsible team or determine the official score. Your decision and reason will be recorded.</p>
        </div> : null}
      </fieldset>
      {unchanged ? <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white/70">
        <input type="checkbox" name="confirmAbandonment" value="yes" required className="mt-1 h-4 w-4" />
        <span>I confirm this fixture outcome and the decision to leave both teams’ fees unchanged. The official result is determined separately by the result decision above, and both teams will be sent the fee decision.</span>
      </label> : children}
    </div>
  );
}
