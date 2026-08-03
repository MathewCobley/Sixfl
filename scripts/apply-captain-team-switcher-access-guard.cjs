const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain team layout.`);
  }
  source = source.replace(before, after);
}

if (!source.includes('from "@/lib/teams/fixture-placeholders"')) {
  replaceRequired(
    'import { requireCaptain } from "@/lib/requireCaptain";',
    [
      'import { requireCaptain } from "@/lib/requireCaptain";',
      'import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    ].join("\n"),
    "fixture placeholder helper import",
  );
}

const oldBlock = [
  "  const captainTeamMemberships = access.user?.id",
  "    ? await prisma.teamMember.findMany({",
  "        where: {",
  "          userId: access.user.id,",
  "          role: TeamRole.CAPTAIN,",
  "        },",
  "        select: {",
  "          team: {",
  "            select: {",
  "              id: true,",
  "              name: true,",
  "              league: {",
  "                select: {",
  "                  name: true,",
  "                  season: true,",
  "                  competition: {",
  "                    select: {",
  "                      name: true,",
  "                      currentLeague: {",
  "                        select: {",
  "                          season: true,",
  "                        },",
  "                      },",
  "                    },",
  "                  },",
  "                },",
  "              },",
  "            },",
  "          },",
  "        },",
  "      })",
  "    : [];",
  "",
  "  const captainTeamOptions = captainTeamMemberships",
  "    .map((membership) => membership.team)",
  "    .sort((a, b) => a.name.localeCompare(b.name));",
  "  const showCaptainTeamSwitcher = !access.isAdmin && captainTeamOptions.length > 1;",
].join("\n");

const newBlock = [
  "  // Never build the team switcher from an administrator's own memberships while",
  "  // they are previewing a captain view. That previously exposed unrelated test and",
  "  // placeholder teams in the preview header and made them look like captain access.",
  "  const isGenuineCaptainSession =",
  "    access.accessMode === \"captain\" && access.isCaptain && !access.isAdmin;",
  "  const captainTeamMemberships =",
  "    isGenuineCaptainSession && access.user?.id",
  "      ? await prisma.teamMember.findMany({",
  "          where: {",
  "            userId: access.user.id,",
  "            role: TeamRole.CAPTAIN,",
  "          },",
  "          select: {",
  "            team: {",
  "              select: {",
  "                id: true,",
  "                name: true,",
  "                league: {",
  "                  select: {",
  "                    name: true,",
  "                    season: true,",
  "                    competition: {",
  "                      select: {",
  "                        name: true,",
  "                        currentLeague: {",
  "                          select: {",
  "                            season: true,",
  "                          },",
  "                        },",
  "                      },",
  "                    },",
  "                  },",
  "                },",
  "              },",
  "            },",
  "          },",
  "        })",
  "      : [];",
  "",
  "  const uniqueCaptainTeams = Array.from(",
  "    new Map(",
  "      captainTeamMemberships.map((membership) => [",
  "        membership.team.id,",
  "        membership.team,",
  "      ]),",
  "    ).values(),",
  "  );",
  "  const placeholderTeamIds = await getFixturePlaceholderTeamIds(",
  "    uniqueCaptainTeams.map((option) => option.id),",
  "  );",
  "  const captainTeamOptions = uniqueCaptainTeams",
  "    .filter((option) => !placeholderTeamIds.has(option.id))",
  "    .sort((a, b) => a.name.localeCompare(b.name));",
  "  const showCaptainTeamSwitcher =",
  "    isGenuineCaptainSession && captainTeamOptions.length > 1;",
].join("\n");

replaceRequired(oldBlock, newBlock, "captain team switcher membership logic");

fs.writeFileSync(filePath, source, "utf8");

if (
  !source.includes("const isGenuineCaptainSession =") ||
  !source.includes("getFixturePlaceholderTeamIds") ||
  source.includes("const showCaptainTeamSwitcher = !access.isAdmin")
) {
  throw new Error("Captain team switcher access guard was not applied correctly.");
}

console.log(
  "Captain team switching is shown only for genuine captain sessions and excludes fixture placeholders.",
);
