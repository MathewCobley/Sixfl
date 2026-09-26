import { getLegacyPaymentLinkClosureContext, getPlayerPaymentLinkSettlementLabel } from "@/lib/payments/player-payment-display";
import { money, type PlayerLedgerAccount } from "@/lib/payments/player-ledger";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

function entryLabel(kind: string) {
  if (kind === "OPENING_BALANCE") return "Balance brought forward";
  if (kind === "CHARGE") return "Match fee charged";
  if (kind === "SETTLEMENT") return "Payment received";
  if (kind === "WAIVER") return "Balance reduced";
  return kind.replaceAll("_", " ");
}

function entryReason(kind: string, reason: string) {
  if (kind === "OPENING_BALANCE") {
    return "Existing unpaid match fee carried into the player ledger when the ledger system was introduced.";
  }
  return reason.replaceAll("[SIXFL_PLAYER_LEDGER_RECEIPTS]", "").trim();
}

function fixtureLabel(fee: PlayerLedgerAccount["fees"][number] | undefined) {
  if (!fee) return null;
  return `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name} · ${formatDateTimeInLondon(
    fee.fixture.kickoffAt,
    { day: "2-digit", month: "short", year: "numeric" },
  )}`;
}

export default function PlayerLedgerStatement({account, showAudit = false, app = false}:{account:PlayerLedgerAccount; showAudit?: boolean; app?: boolean}){
  const stateByFeeId = new Map(account.states.map(state => [state.feeId, state]));
  const feeById = new Map(account.fees.map(fee => [fee.id, fee]));
  const runningBalanceByEntryId = new Map<string, number>();
  let runningBalance = 0;
  for (const entry of account.entries) {
    runningBalance += entry.amountPence;
    runningBalanceByEntryId.set(entry.id, runningBalance);
  }
  const entries = [...account.entries].sort((left, right) => {
    if (left.sequence === right.sequence) return 0;
    return left.sequence < right.sequence ? 1 : -1;
  });

  if (app) {
    return (
      <section className="overflow-hidden rounded-[1.15rem] border border-white/[0.07] bg-white/[0.035]">
        <div className="border-b border-white/[0.07] px-3.5 py-3">
          <h2 className="text-sm font-black text-white">Payment history</h2>
          <p className="mt-0.5 text-[10px] text-white/35">Most recent activity first</p>
        </div>
        {entries.length === 0 ? (
          <div className="p-4 text-sm text-white/45">No payment activity recorded yet.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {entries.map((e) => {
              const fee = feeById.get(e.feeId);
              const displayDate =
                e.kind === "OPENING_BALANCE" && fee?.fixture?.kickoffAt
                  ? fee.fixture.kickoffAt
                  : e.createdAt;
              const matchLabel = fixtureLabel(fee);
              return (
                <details key={e.id} className="group">
                  <summary className="cursor-pointer list-none px-3.5 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-white/75">{entryLabel(e.kind)}</div>
                        <div className="mt-0.5 text-[9px] text-white/30">
                          {formatDateTimeInLondon(displayDate, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: e.kind === "OPENING_BALANCE" ? undefined : "2-digit",
                            minute: e.kind === "OPENING_BALANCE" ? undefined : "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={e.amountPence > 0 ? "text-sm font-black text-amber-100" : "text-sm font-black text-emerald-100"}>
                          {e.amountPence > 0 ? "+" : ""}{money(e.amountPence)}
                        </div>
                        <div className="text-[9px] text-white/25">
                          Balance {money(runningBalanceByEntryId.get(e.id) ?? 0)}
                        </div>
                      </div>
                    </div>
                  </summary>
                  <div className="space-y-1 border-t border-white/[0.06] bg-black/10 p-3.5 text-[10px] leading-4 text-white/45">
                    {matchLabel ? <p className="font-bold text-emerald-100/65">{matchLabel}</p> : null}
                    <p>{entryReason(e.kind, e.reason)}</p>
                    {e.receivedBy ? <p>Received by {e.receivedBy === "CAPTAIN" ? "captain — not a SIXFL bank receipt" : "SIXFL"}</p> : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <details className="group border-t border-white/[0.07]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-black text-white [&::-webkit-details-marker]:hidden">
            <span>Payment link history ({account.paymentLinks.length})</span>
            <span className="text-white/25 transition group-open:rotate-45">+</span>
          </summary>
          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {account.paymentLinks.length === 0 ? (
              <div className="p-3.5 text-xs text-white/40">No player payment links recorded.</div>
            ) : (
              [...account.paymentLinks]
                .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
                .map((link) => {
                  const fee = feeById.get(link.feeId);
                  const settlementLabel = getPlayerPaymentLinkSettlementLabel(link, fee, stateByFeeId.get(link.feeId));
                  const label = link.fixtureLabel ?? fixtureLabel(fee) ?? "Player payment link";
                  const active =
                    !settlementLabel &&
                    !link.isRemoved &&
                    fee?.paymentToken === link.paymentToken &&
                    fee?.status === "OPEN";
                  return (
                    <div key={link.id} className="p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-black leading-5 text-white/70">{label}</div>
                          <div className="mt-0.5 text-[9px] text-white/30">
                            {formatDateTimeInLondon(link.createdAt,{day:"2-digit",month:"short",year:"numeric"})}
                            {link.amountPence !== null ? " · " + money(link.amountPence) : ""}
                          </div>
                        </div>
                        <span className={
                          settlementLabel
                            ? "shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-100"
                            : active
                              ? "shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-100"
                              : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-white/45"
                        }>
                          {settlementLabel ?? (active ? "Ready to pay" : "Inactive")}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </details>
      </section>
    );
  }

  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <h2 className="text-lg font-semibold">Payment history</h2>
    <p className="mt-1 text-sm text-white/60">Most recent activity is shown first. Older unpaid fees that existed before player ledgers were introduced are shown as balances brought forward against the original fixture date.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/55"><tr><th className="p-2">Date</th><th className="p-2">Entry</th><th className="p-2 text-right">Charge / credit</th><th className="p-2 text-right">Balance</th></tr></thead>
      <tbody>{entries.map(e=>{
        const fee = feeById.get(e.feeId);
        const displayDate = e.kind === "OPENING_BALANCE" && fee?.fixture?.kickoffAt
          ? fee.fixture.kickoffAt
          : e.createdAt;
        const matchLabel = fixtureLabel(fee);
        return <tr key={e.id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-2">{formatDateTimeInLondon(displayDate,{day:"2-digit",month:"short",year:"numeric",hour:e.kind==="OPENING_BALANCE"?undefined:"2-digit",minute:e.kind==="OPENING_BALANCE"?undefined:"2-digit"})}</td><td className="p-2"><span className="font-medium">{entryLabel(e.kind)}</span>{matchLabel?<p className="mt-1 text-xs font-medium text-emerald-100/80">Match: {matchLabel}</p>:null}<p className="mt-1 max-w-xl text-xs text-white/55">{entryReason(e.kind,e.reason)}</p>{e.receivedBy?<p className="text-xs text-white/55">Received by {e.receivedBy==="CAPTAIN"?"captain — not a SIXFL bank receipt":"SIXFL"}</p>:null}</td><td className="whitespace-nowrap p-2 text-right">{e.amountPence>0?"+":""}{money(e.amountPence)}</td><td className="whitespace-nowrap p-2 text-right font-semibold">{money(runningBalanceByEntryId.get(e.id) ?? 0)}</td></tr>;
      })}</tbody>
    </table></div>

    <div className="mt-7 border-t border-white/10 pt-5">
      <h3 className="text-base font-semibold">Payment link history</h3>
      <p className="mt-1 text-sm text-white/60">
        Your current and previous payment links.
      </p>
      {account.paymentLinks.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">No player payment links have been recorded for this account.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {[...account.paymentLinks]
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
            .map((link) => {
              const fee = feeById.get(link.feeId);
              const settlementLabel = getPlayerPaymentLinkSettlementLabel(link, fee, stateByFeeId.get(link.feeId));
              const label = link.fixtureLabel ?? fixtureLabel(fee) ?? "Player payment link";
              const active =
                !settlementLabel &&
                !link.isRemoved &&
                fee?.paymentToken === link.paymentToken &&
                fee?.status === "OPEN";

              return (
                <div key={link.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{label}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {link.source.endsWith("BACKFILL") ? "First recorded" : "Created"} {formatDateTimeInLondon(link.createdAt,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                        {link.amountPence !== null ? ` · ${money(link.amountPence)}` : ""}
                      </div>
                    </div>
                    <span className={
                      settlementLabel ? "rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100" : showAudit && link.isRemoved
                        ? "rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-100"
                        : active
                          ? "rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100"
                          : "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/55"
                    }>
                      {settlementLabel ?? (showAudit ? (link.isRemoved ? "Removed" : active ? "Active" : "Closed") : (active ? "Ready to pay" : "Inactive"))}
                    </span>
                  </div>
                  {showAudit && (() => {
                    const events = account.paymentLinkEvents.filter(
                      (event) =>
                        event.feeId === link.feeId &&
                        event.paymentToken === link.paymentToken,
                    );
                    const createdEvent =
                      events.find((event) => event.eventType === "CREATED") ?? null;
                    const latestEndEvent =
                      [...events]
                        .reverse()
                        .find((event) =>
                          ["REMOVED", "CLOSED", "REOPENED"].includes(event.eventType),
                        ) ?? null;
                    const actorLabel = (
                      event: (typeof events)[number] | null,
                    ) => {
                      if (!event) return "Actor not recorded";
                      if (event.actorKind === "LEGACY") {
                        return "Legacy · actor not recorded";
                      }
                      if (event.actorKind === "SYSTEM") return "SIXFL System";
                      const role = event.actorRole
                        ? ` · ${event.actorRole.toLowerCase().replaceAll("_", " ")}`
                        : "";
                      return `${event.actorName || "Signed-in SIXFL user"}${role}`;
                    };

                    return (
                      <div className="mt-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs leading-5 text-white/50">
                        <div>
                          <span className="font-semibold text-white/70">Created by:</span>{" "}
                          {actorLabel(createdEvent)}
                          {createdEvent?.via ? ` · ${createdEvent.via}` : ""}
                        </div>
                        {latestEndEvent ? (
                          <div>
                            <span className="font-semibold text-white/70">
                              {latestEndEvent.eventType === "REMOVED"
                                ? "Removed by:"
                                : latestEndEvent.eventType === "REOPENED"
                                  ? "Reopened by:"
                                  : "Closed by:"}
                            </span>{" "}
                            {actorLabel(latestEndEvent)}
                            {latestEndEvent.via ? ` · ${latestEndEvent.via}` : ""}
                            {latestEndEvent.reason ? ` · ${latestEndEvent.reason}` : ""}
                            {latestEndEvent.actorKind === "LEGACY" && getLegacyPaymentLinkClosureContext(fee)
                              ? ` · ${getLegacyPaymentLinkClosureContext(fee)}`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}

                  {showAudit ? <>
                  <div className="mt-2 break-all rounded-lg bg-black/20 px-2.5 py-2 font-mono text-[10px] leading-5 text-white/35">
                    {link.paymentUrl}
                  </div>
                  <div className="mt-2 text-xs text-white/50">
                    {link.openCount > 0
                      ? `Opened ${link.openCount} time${link.openCount === 1 ? "" : "s"} · first ${formatDateTimeInLondon(link.firstOpenedAt!,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}${link.openCount > 1 && link.lastOpenedAt ? ` · last ${formatDateTimeInLondon(link.lastOpenedAt,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}` : ""}`
                      : "Never opened"}
                  </div>
                  </> : null}
                  {settlementLabel ? <p className="mt-2 text-xs text-emerald-100/70">This match fee is settled. No payment is due.</p> : showAudit && link.isRemoved ? (
                    <p className="mt-2 text-xs leading-5 text-red-100/65">
                      {link.removedAt
                        ? `Removed ${formatDateTimeInLondon(link.removedAt,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}. `
                        : "Removed — exact legacy removal time unavailable. "}
                      {link.removedReason || ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
        </div>
      )}
    </div>
  </section>;
}
