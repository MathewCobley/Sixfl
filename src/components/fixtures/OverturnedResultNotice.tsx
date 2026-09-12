import { RESULT_OVERTURN_REASONS } from "@/lib/fixtures/result-score";
export default function OverturnedResultNotice({ overturn, homeName, awayName }: {
  overturn?: { originalHomeScore: number; originalAwayScore: number; reasonCode: string } | null;
  homeName: string; awayName: string;
}) {
  if (!overturn) return null;
  return <div data-result-overturned className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/[0.06] p-3 text-sm leading-6 text-amber-100">
    <p className="font-semibold">Awarded result · Overturned by SIXFL</p>
    <p>{RESULT_OVERTURN_REASONS.find(r => r.value === overturn.reasonCode)?.label || "Competition decision"}</p>
    <p className="text-white/65">On pitch: {homeName} {overturn.originalHomeScore}–{overturn.originalAwayScore} {awayName}. The league table uses the awarded score.</p>
  </div>;
}
