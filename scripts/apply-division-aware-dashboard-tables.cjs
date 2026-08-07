const fs = require("node:fs");
const path = require("node:path");

function patchFile(filePath, transform, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`${label} patch skipped: file not found.`);
    return;
  }

  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    console.log(`Applied ${label} patch.`);
  } else {
    console.log(`${label} patch already applied or source changed.`);
  }
}

const root = process.cwd();

patchFile(
  path.join(root, "src", "lib", "leagueTable.ts"),
  (source) => {
    const before = `  if (placeholderTeamIds.size === 0) return teams;\n\n  return teams.filter((team) => !placeholderTeamIds.has(team.id));`;
    const after = `  return teams.filter(\n    (team) =>\n      !placeholderTeamIds.has(team.id) &&\n      team.name.trim().toLowerCase() !== "tbc",\n  );`;
    return source.includes(before) ? source.replace(before, after) : source;
  },
  "league table placeholder safeguard",
);

patchFile(
  path.join(root, "src", "app", "player", "team", "[teamid]", "page.tsx"),
  (source) => {
    if (!source.includes('import DivisionAwareDashboardTables from "@/components/leagues/DivisionAwareDashboardTables";')) {
      source = source.replace(
        'import Link from "next/link";\n',
        'import Link from "next/link";\nimport DivisionAwareDashboardTables from "@/components/leagues/DivisionAwareDashboardTables";\n',
      );
    }

    const marker = `        </section>\n      </div>\n    </main>`;
    const insertion = `        </section>\n\n        {team.league?.id ? (\n          <DivisionAwareDashboardTables\n            leagueId={team.league.id}\n            leagueName={team.league.name}\n            season={team.league.season}\n            emptyMessage="This table will populate as completed results are entered."\n          />\n        ) : null}\n      </div>\n    </main>`;

    if (!source.includes("<DivisionAwareDashboardTables") && source.includes(marker)) {
      source = source.replace(marker, insertion);
    }

    return source;
  },
  "player dashboard standings",
);

patchFile(
  path.join(root, "src", "app", "captain", "team", "[teamid]", "page.tsx"),
  (source) => {
    if (!source.includes('import DivisionAwareDashboardTables from "@/components/leagues/DivisionAwareDashboardTables";')) {
      source = source.replace(
        'import CaptainDashboardLeagueTable from "@/components/captain/CaptainDashboardLeagueTable";\n',
        'import CaptainDashboardLeagueTable from "@/components/captain/CaptainDashboardLeagueTable";\nimport DivisionAwareDashboardTables from "@/components/leagues/DivisionAwareDashboardTables";\n',
      );
    }

    const before = `      <div id="captain-league-table">\n        <CaptainDashboardLeagueTable rows={leagueTable} title={leagueTableTitle} description={leagueTableDescription} emptyMessage={currentLeagueId ? "The league table will appear here once teams have been added." : "Your team is not assigned to a league yet, so there is no table to show here."} />\n      </div>`;
    const after = `      <div id="captain-league-table">\n        {currentLeagueId && currentLeague ? (\n          <DivisionAwareDashboardTables\n            leagueId={currentLeagueId}\n            leagueName={currentLeague.name}\n            season={currentLeague.season}\n            emptyMessage="This table will populate as completed results are entered."\n          />\n        ) : (\n          <CaptainDashboardLeagueTable\n            rows={[]}\n            title={leagueTableTitle}\n            description={leagueTableDescription}\n            emptyMessage="Your team is not assigned to a league yet, so there is no table to show here."\n          />\n        )}\n      </div>`;

    if (source.includes(before)) {
      source = source.replace(before, after);
    }

    return source;
  },
  "captain dashboard division tables",
);

require("./apply-player-current-league-context.cjs");
require("./apply-fixture-division-standings-repair.cjs");
