import { money, type PlayerLedgerAccount } from "@/lib/payments/player-ledger";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export default function PlayerLedgerStatement({account}:{account:PlayerLedgerAccount}){
  let running=0;
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <h2 className="text-lg font-semibold">Payment history</h2>
    <p className="mt-1 text-sm text-white/60">Charges, payments and explicit adjustments. Payment links and instalment requests do not change this balance. Opening balances use the amounts already recorded; earlier fee edits have not been reconstructed.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/55"><tr><th className="p-2">Date</th><th className="p-2">Entry</th><th className="p-2 text-right">Charge / credit</th><th className="p-2 text-right">Balance</th></tr></thead>
      <tbody>{account.entries.map(e=>{running+=e.amountPence;return <tr key={e.id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-2">{formatDateTimeInLondon(e.createdAt,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td><td className="p-2"><span className="font-medium">{e.kind.replaceAll("_"," ")}</span><p className="mt-1 max-w-xl text-xs text-white/55">{e.reason.replaceAll("[SIXFL_PLAYER_LEDGER_RECEIPTS]","")}</p>{e.receivedBy?<p className="text-xs text-white/55">Received by {e.receivedBy==="CAPTAIN"?"captain — not a SIXFL bank receipt":"SIXFL"}</p>:null}</td><td className="whitespace-nowrap p-2 text-right">{e.amountPence>0?"+":""}{money(e.amountPence)}</td><td className="whitespace-nowrap p-2 text-right font-semibold">{money(running)}</td></tr>;})}</tbody>
    </table></div>
  </section>;
}
