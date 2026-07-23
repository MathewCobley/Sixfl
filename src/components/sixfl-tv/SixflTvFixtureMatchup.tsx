// ========================================
// File: src/components/sixfl-tv/SixflTvFixtureMatchup.tsx
// ========================================

import TeamBadge from "@/components/admin/TeamBadge";

type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

export default function SixflTvFixtureMatchup({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
}: {
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const hasResult = homeScore !== null && awayScore !== null;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <TeamBadge name={homeTeam.name} logoUrl={homeTeam.logoUrl} size="sm" />
        <span className="min-w-0 truncate text-base font-semibold text-white sm:text-lg">
          {homeTeam.name}
        </span>
      </div>

      <div className="flex min-w-[58px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black text-white sm:min-w-[72px] sm:text-base">
        {hasResult ? `${homeScore}-${awayScore}` : "vs"}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3 text-right">
        <span className="min-w-0 truncate text-base font-semibold text-white sm:text-lg">
          {awayTeam.name}
        </span>
        <TeamBadge name={awayTeam.name} logoUrl={awayTeam.logoUrl} size="sm" />
      </div>
    </div>
  );
}
