import { describeResultOverturn, type OverturnedScoreSummary } from "@/lib/fixtures/result-score";

export default function OverturnedResultNotice({ overturn, homeName, awayName }: {
  overturn?: OverturnedScoreSummary | null;
  homeName: string;
  awayName: string;
}) {
  if (!overturn) return null;
  const result = describeResultOverturn(overturn, homeName, awayName);
  return <div data-result-overturned className="mt-3 space-y-2 rounded-xl border border-amber-300/25 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
    <p className="font-semibold">Default win awarded to {result.winner} · Rule breach</p>
    <p className="text-white/75"><span className="font-semibold">Original on-pitch result:</span> {result.original}</p>
    <p><span className="font-semibold">Official awarded result:</span> {result.awarded}</p>
    <p className="text-white/65">Overturned by SIXFL · {result.reason}. The league table uses the awarded result.</p>
  </div>;
}
