type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeamBadge({
  team,
  compact,
}: {
  team: FixtureTeam;
  compact: boolean;
}) {
  const sizeClass = compact ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/30 ${sizeClass}`}
      aria-label={`${team.name} badge`}
    >
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={`${team.name} badge`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[10px] font-black text-white/65">
          {getInitials(team.name)}
        </span>
      )}
    </span>
  );
}

export default function PlayerFixtureTeams({
  homeTeam,
  awayTeam,
  compact = false,
}: {
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          <TeamBadge team={homeTeam} compact />
          <span className="min-w-0 break-words">{homeTeam.name}</span>
        </span>
        <span className="shrink-0 text-white/45">vs</span>
        <span className="inline-flex min-w-0 items-center gap-2">
          <TeamBadge team={awayTeam} compact />
          <span className="min-w-0 break-words">{awayTeam.name}</span>
        </span>
      </span>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
      <div className="flex min-w-0 flex-col items-center gap-2 text-center">
        <TeamBadge team={homeTeam} compact={false} />
        <span className="line-clamp-2 text-xs font-semibold leading-4 text-white">
          {homeTeam.name}
        </span>
      </div>
      <span className="pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
        vs
      </span>
      <div className="flex min-w-0 flex-col items-center gap-2 text-center">
        <TeamBadge team={awayTeam} compact={false} />
        <span className="line-clamp-2 text-xs font-semibold leading-4 text-white">
          {awayTeam.name}
        </span>
      </div>
    </div>
  );
}
