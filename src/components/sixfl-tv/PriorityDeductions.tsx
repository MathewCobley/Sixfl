import { formatDateTimeInLondon } from "@/lib/datetime/london";
import type { PriorityDeduction } from "@/lib/sixfl-tv/priority-deductions";

export default function PriorityDeductions({ deductions, deductionPoints }: { deductions: PriorityDeduction[]; deductionPoints: number }) {
  return <section aria-label="Priority deductions" className="space-y-3 rounded-2xl border border-amber-300/20 bg-black/20 p-4">
    <div className="flex justify-between gap-3 font-semibold"><h3>Current deductions</h3><span>{deductionPoints ? `−${deductionPoints}` : "None"}</span></div>
    <p className="text-xs leading-5 text-white/60">These come off your overall Priority Score, separately from the recent match points below. The score cannot fall below zero.</p>
    {deductions.map(row => <div key={row.id} className="border-t border-white/10 pt-3 text-sm">
      <div className="flex justify-between gap-3"><span>{row.label}</span><strong className="whitespace-nowrap text-amber-200">{row.points ? `−${row.points}` : "At cap"}</strong></div>
      <p className="mt-1 text-xs leading-5 text-white/60">{row.recovery}{row.expiresAt ? ` Expires ${formatDateTimeInLondon(row.expiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
    </div>)}
    <details className="text-xs leading-5 text-white/60"><summary className="cursor-pointer">How deductions work</summary><ul className="mt-2 list-disc space-y-1 pl-4">
      <li>Any undisputed amount more than 14 days overdue: −10 until cleared, once for the account.</li>
      <li>Recorded shin-pad warning: −5 for 28 days, once per team per fixture, capped at −15.</li>
      <li>SIXFL-confirmed sending-off: −10, or −20 for serious misconduct, for 28 days from the fixture. Capped at −30 across fixtures.</li>
      <li>Contact SIXFL if a record is wrong or a charge is disputed. SIXFL can exclude it while reviewing it.</li>
    </ul></details>
  </section>;
}
