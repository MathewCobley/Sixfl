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

patchFile(
  path.join(root, "src", "app", "(public)", "leagues", "[slug]", "page.tsx"),
  (source) => {
    if (!source.includes('import { getLeagueStandings } from "@/lib/standings";')) {
      source = source.replace(
        'import { prisma } from "@/lib/prisma";\n',
        'import { prisma } from "@/lib/prisma";\nimport { getLeagueStandings } from "@/lib/standings";\n',
      );
    }

    // Remove only the legacy local table calculator. Keep any helper functions
    // that now sit between it and buildSeoLocation (for example venue helpers).
    source = source.replace(
      /function buildLeagueTable\([\s\S]*?\n}\n\n(?=function (?:isVenueToBeConfirmed|buildSeoLocation))/, 
      "",
    );

    const leagueFoundAnchor = `  if (!league) {\n    notFound();\n  }\n\n  const nightLabel = formatPreferredNight(league.dayOfWeek);`;
    const leagueFoundReplacement = `  if (!league) {\n    notFound();\n  }\n\n  const centralStandings = await getLeagueStandings(league.id);\n\n  const nightLabel = formatPreferredNight(league.dayOfWeek);`;
    if (!source.includes("const centralStandings = await getLeagueStandings(league.id);") && source.includes(leagueFoundAnchor)) {
      source = source.replace(leagueFoundAnchor, leagueFoundReplacement);
    }

    source = source.replaceAll("league.teams.length", "centralStandings.rows.length");

    const localTableCall = `  const leagueTable = buildLeagueTable(league.teams, league.fixtures);`;
    const centralTableMapping = `  const leagueTable: TableRow[] = centralStandings.rows.map((row) => ({\n    team: {\n      id: row.teamId,\n      name: row.teamName,\n      logoUrl: row.teamLogoUrl,\n    },\n    played: row.played,\n    wins: row.won,\n    draws: row.drawn,\n    losses: row.lost,\n    goalsFor: row.goalsFor,\n    goalsAgainst: row.goalsAgainst,\n    goalDifference: row.goalDifference,\n    points: row.points,\n    recentForm: row.recentForm,\n  }));`;
    if (source.includes(localTableCall)) {
      source = source.replace(localTableCall, centralTableMapping);
    }

    const canonicalClubs = `  const leagueClubs = centralStandings.rows\n    .map((row) => ({\n      id: row.teamId,\n      name: row.teamName,\n      logoUrl: row.teamLogoUrl,\n    }))\n    .sort((a, b) => a.name.localeCompare(b.name));`;
    if (!source.includes("const leagueClubs = centralStandings.rows") && source.includes(centralTableMapping)) {
      source = source.replace(
        centralTableMapping,
        `${centralTableMapping}\n\n${canonicalClubs}`,
      );
    }

    source = source.replaceAll("league.teams.map((team) =>", "leagueClubs.map((team) =>");

    if (
      source.includes("function buildLeagueTable(") ||
      source.includes("buildLeagueTable(league.teams") ||
      source.includes("league.teams.map((team)") ||
      source.includes("league.teams.length") ||
      !source.includes("getLeagueStandings(league.id)") ||
      !source.includes("const leagueClubs = centralStandings.rows")
    ) {
      throw new Error(
        "Public league landing still contains legacy league membership or a local league-table calculation.",
      );
    }

    return source;
  },
  "public league central standings and clubs",
);

patchFile(
  path.join(root, "src", "app", "(public)", "teams", "[id]", "page.tsx"),
  (source) => {
    if (!source.includes('import { getLeagueStandings } from "@/lib/standings";')) {
      source = source.replace(
        'import { prisma } from "@/lib/prisma";\n',
        'import { prisma } from "@/lib/prisma";\nimport { getLeagueStandings } from "@/lib/standings";\n',
      );
    }

    source = source.replace(
      /function buildLeagueTable\([\s\S]*?\n}\n\n\/\/ ========================================\n\/\/ Page/,
      "// ========================================\n// Page",
    );

    const teamFoundAnchor = `  if (!team) {\n    notFound();\n  }\n\n  const teamLogo = normaliseLogoUrl(team.logoUrl);`;
    const teamFoundReplacement = `  if (!team) {\n    notFound();\n  }\n\n  const centralStandings = team.league\n    ? await getLeagueStandings(team.league.id)\n    : null;\n\n  const teamLogo = normaliseLogoUrl(team.logoUrl);`;
    if (!source.includes("const centralStandings = team.league") && source.includes(teamFoundAnchor)) {
      source = source.replace(teamFoundAnchor, teamFoundReplacement);
    }

    const localTableCall = `  const leagueTable = buildLeagueTable(team.league.teams, leagueFixtures);`;
    const centralTableMapping = `  const leagueTable: TableRow[] = (centralStandings?.rows ?? []).map((row) => ({\n    team: {\n      id: row.teamId,\n      name: row.teamName,\n      logoUrl: row.teamLogoUrl,\n    },\n    played: row.played,\n    wins: row.won,\n    draws: row.drawn,\n    losses: row.lost,\n    goalsFor: row.goalsFor,\n    goalsAgainst: row.goalsAgainst,\n    goalDifference: row.goalDifference,\n    points: row.points,\n  }));`;
    if (source.includes(localTableCall)) {
      source = source.replace(localTableCall, centralTableMapping);
    }

    if (
      source.includes("function buildLeagueTable(") ||
      source.includes("buildLeagueTable(team.league.teams") ||
      !source.includes("getLeagueStandings(team.league.id)") ||
      !source.includes("const leagueTable: TableRow[] = (centralStandings?.rows ?? [])")
    ) {
      throw new Error(
        "Public team page still contains a local league-table calculation.",
      );
    }

    return source;
  },
  "public team central standings",
);

require("./apply-player-current-league-context.cjs");
