import { Prisma } from "@prisma/client";

import LeagueTableCard from "@/components/leagues/LeagueTableCard";
import { getLeagueTable } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";

type DivisionRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

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
  const divisions = await prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
    SELECT "id", "name", "slug", "sortOrder"
    FROM "LeagueDivision"
    WHERE "leagueId" = ${leagueId}
      AND "isActive" = true
    ORDER BY "sortOrder" ASC, "name" ASC
  `);

  const tables =
    divisions.length > 0
      ? await Promise.all(
          divisions.map(async (division) => ({
            id: division.id,
            title: division.name,
            rows: await getLeagueTable(leagueId, { divisionId: division.id }),
          })),
        )
      : [
          {
            id: leagueId,
            title: `Current ${leagueName} 6 a side table`,
            rows: await getLeagueTable(leagueId),
          },
        ];

  return (
    <section className="space-y-7">
      {tables.map((table) => (
        <LeagueTableCard
          key={table.id}
          rows={table.rows}
          eyebrow={divisions.length > 0 ? leagueName : "Standings"}
          title={table.title}
          description={
            divisions.length > 0
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
