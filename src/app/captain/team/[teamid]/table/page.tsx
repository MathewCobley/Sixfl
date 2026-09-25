import { notFound } from "next/navigation";

import CaptainDashboardLeagueTable from "@/components/captain/CaptainDashboardLeagueTable";
import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { requireCaptain } from "@/lib/requireCaptain";
import { getLeagueStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "League Table | SIXFL" };

export default async function CaptainTablePage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const context = await getCaptainRelatedTeamContext(teamid);
  if (!context) notFound();

  const { currentLeague, currentLeagueId, relatedTeamIds } = context;
  const standings = currentLeagueId ? await getLeagueStandings(currentLeagueId) : null;
  const division = standings?.divisions.find((candidate) =>
    candidate.rows.some((row) => relatedTeamIds.includes(row.teamId)),
  );
  const awaitingDivision = Boolean(
    standings?.hasDivisions &&
    standings.divisions.some((candidate) => candidate.rows.length > 0) &&
    !division,
  );
  // Never flatten several divisions into one ranked table. When division
  // records are empty, retain the central service's active-season fallback.
  const rows = division?.rows ?? (awaitingDivision ? [] : standings?.rows ?? []);
  const unavailableMessage = !currentLeagueId
    ? "Your team is not assigned to a league yet."
    : awaitingDivision
      ? "Your team has not been assigned to a division yet. Contact SIXFL to check your league placement."
      : null;

  return (
    <div id="captain-table" className="scroll-mt-4" data-captain-table-page>
      <h1 className="sr-only">League table</h1>
      {unavailableMessage ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-xl font-bold text-white">League table</h2>
          <p className="mt-2 text-sm text-white/65">{unavailableMessage}</p>
        </section>
      ) : (
        <CaptainDashboardLeagueTable
          rows={rows}
          title={division ? `${currentLeague?.name ?? "League"} · ${division.name}` : currentLeague?.name ?? "League table"}
          description="Points, goal difference and recent form in your current league."
          emptyMessage="The league table will appear here once teams have been added."
          currentTeamIds={relatedTeamIds}
        />
      )}
    </div>
  );
}
