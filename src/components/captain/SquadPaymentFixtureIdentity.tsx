type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

type FixtureIdentity = {
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeamBadge({ team, compact }: { team: FixtureTeam; compact: boolean }) {
  const sizeClass = compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";

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
        <span className="text-[10px] font-black text-white/65">{initials(team.name)}</span>
      )}
    </span>
  );
}

export default function SquadPaymentFixtureIdentity({
  fixture,
  fallbackLabel,
  compact = false,
}: {
  fixture: FixtureIdentity | null;
  fallbackLabel: string;
  compact?: boolean;
}) {
  if (!fixture) {
    return <span className="min-w-0 break-words">{fallbackLabel}</span>;
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <span className="inline-flex min-w-0 items-center gap-2">
        <TeamBadge team={fixture.homeTeam} compact={compact} />
        <span className="min-w-0 break-words">{fixture.homeTeam.name}</span>
      </span>
      <span className="text-white/45">vs</span>
      <span className="inline-flex min-w-0 items-center gap-2">
        <TeamBadge team={fixture.awayTeam} compact={compact} />
        <span className="min-w-0 break-words">{fixture.awayTeam.name}</span>
      </span>
    </span>
  );
}
