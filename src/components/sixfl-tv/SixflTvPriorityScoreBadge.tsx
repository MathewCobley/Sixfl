import { priorityScoreTone, type SixflTvPriorityScore } from "@/lib/sixfl-tv/priority-score";

export default function SixflTvPriorityScoreBadge({
  score,
  showLabel = true,
}: {
  score: SixflTvPriorityScore;
  showLabel?: boolean;
}) {
  const tone = priorityScoreTone(score);
  const className =
    tone === "HIGH"
      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
      : tone === "GOOD"
        ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
        : tone === "LOW"
          ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
          : "border-red-400/35 bg-red-500/15 text-red-100";

  return (
    <span
      title={
        score.qualifies
          ? "Eligible for SIXFL TV recorded-pitch priority"
          : "Not currently eligible for recorded-pitch priority"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {showLabel ? <span>SIXFL TV Priority</span> : null}
      <span>{score.score}/100</span>
      {score.provisional ? <span className="font-normal opacity-70">Provisional</span> : null}
    </span>
  );
}
