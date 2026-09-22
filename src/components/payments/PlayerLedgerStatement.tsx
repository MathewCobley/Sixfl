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

export default function PlayerLedgerStatement({account}:{account:PlayerLedgerAccount}){
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
  </section>;
}
