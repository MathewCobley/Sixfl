"use client";

import { removeLeagueDivisionAction } from "@/app/(admin)/admin/leagues/[id]/division-actions";

export default function RemoveLeagueDivisionButton({
  leagueId,
  divisionId,
  divisionName,
  teamCount,
}: {
  leagueId: string;
  divisionId: string;
  divisionName: string;
  teamCount: number;
}) {
  return (
    <form
      action={removeLeagueDivisionAction}
      onSubmit={(event) => {
        const teamText =
          teamCount > 0
            ? ` The ${teamCount} team${teamCount === 1 ? "" : "s"} in it will stay in the season and move to No division.`
            : "";
        if (
          !window.confirm(
            `Remove ${divisionName} from this season?${teamText} Completed fixture history will be kept.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <button
        type="submit"
        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
      >
        Remove division
      </button>
    </form>
  );
}
