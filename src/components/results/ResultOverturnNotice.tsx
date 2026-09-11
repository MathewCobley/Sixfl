import { getOnPitchResult, type ResultScoreSnapshot } from "@/lib/results/result-scores";

/** Safe, shared public presentation. Never accepts private decision fields. */
export default function ResultOverturnNotice({ result, homeName, awayName }: {
  result: ResultScoreSnapshot | null | undefined; homeName?: string; awayName?: string;
}) {
  if (!result?.overturnedAt) return null;
  const original = getOnPitchResult(result);
  return <div data-result-overturned className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/[0.07] px-3 py-2 text-sm leading-5">
    <p className="font-semibold text-amber-100">Awarded · Result overturned by SIXFL</p>
    {original ? <p className="mt-1 text-xs text-white/70">On-pitch result: {homeName ? `${homeName} ` : ""}{original.homeScore}–{original.awayScore}{awayName ? ` ${awayName}` : ""}. The awarded score counts in the league table.</p> : <p className="mt-1 text-xs text-white/70">The awarded score counts in the league table.</p>}
  </div>;
}
