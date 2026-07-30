import LeagueTableCard from "@/components/leagues/LeagueTableCard";
import { getLeagueStandings } from "@/lib/standings";

export default async function DivisionAwareDashboardTables({
  leagueId,
  leagueName,
  season,
  emptyMessage,
}: {
  leagueId: string;
  leagueName: string;
  season?: string | null;
  emptyMessage: string;
}) {
  const standings = await getLeagueStandings(leagueId);
  const tables = standings.hasDivisions
    ? standings.divisions.map((division) => ({
        id: division.id,
        title: division.name,
        rows: division.rows,
      }))
    : [
        {
          id: leagueId,
          title: `Current ${leagueName} 6 a side table`,
          rows: standings.rows,
        },
      ];

  return (
    <section className="space-y-7">
      {tables.map((table) => (
        <LeagueTableCard
          key={table.id}
          rows={table.rows}
          eyebrow={standings.hasDivisions ? leagueName : "Standings"}
          title={table.title}
          description={
            standings.hasDivisions
              ? `${season ?? "Current season"} · ${table.rows.length} active teams`
              : `${leagueName}${season ? ` · ${season}` : ""}`
          }
          showTeamLinks={false}
          emptyMessage={emptyMessage}
        />
      ))}
    </section>
  );
}
