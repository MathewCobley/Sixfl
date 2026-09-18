export default function LeaguePositionMovement({
  change,
  compact = false,
}: {
  change: number | null | undefined;
  compact?: boolean;
}) {
  if (!change) return null;

  const movedUp = change > 0;
  const places = Math.abs(change);
  const label = movedUp
    ? `Moved up ${places} place${places === 1 ? "" : "s"} since the previous matchnight`
    : `Moved down ${places} place${places === 1 ? "" : "s"} since the previous matchnight`;

  return (
    <span
      aria-label={label}
      title={label}
      className={[
        "inline-flex shrink-0 items-center justify-center font-black leading-none",
        compact ? "text-sm" : "text-base",
        movedUp ? "text-emerald-300" : "text-red-300",
      ].join(" ")}
    >
      {movedUp ? "↑" : "↓"}
    </span>
  );
}
