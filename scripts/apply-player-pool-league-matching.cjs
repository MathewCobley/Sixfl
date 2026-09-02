const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(before, after);
  write(filePath, source);
}

const captainPage = "src/app/captain/team/[teamid]/player-pool/page.tsx";
const adminPage = "src/app/(admin)/admin/player-pool/page.tsx";
const leadAction = "src/app/(admin)/admin/leads/player-pool-actions.ts";

replaceOnce(
  captainPage,
  [
    "  leagueId: string | null;",
    "  preferredPosition: string | null;",
  ].join("\n"),
  [
    "  leagueId: string | null;",
    "  leagueIds: string[];",
    "  leagueNames: string[];",
    "  hasLeaguePreferences: boolean;",
    "  preferredPosition: string | null;",
  ].join("\n"),
  "captain PlayerPool league preference fields",
);

replaceOnce(
  captainPage,
  [
    '        profile."area",',
    '        profile."leagueId",',
    '        profile."preferredPosition",',
  ].join("\n"),
  [
    '        profile."area",',
    '        profile."leagueId",',
    '        ARRAY(',
    '          SELECT preference."leagueId"',
    '          FROM "PlayerPoolLeaguePreference" preference',
    '          WHERE preference."profileId" = profile."id"',
    "            AND preference.\"availabilityStatus\" IN ('AVAILABLE', 'MOST_WEEKS', 'SOMETIMES')",
    '          ORDER BY preference."isPrimary" DESC, preference."createdAt" ASC',
    '        ) AS "leagueIds",',
    '        ARRAY(',
    '          SELECT COALESCE(competition."name", preference_league."name")',
    '          FROM "PlayerPoolLeaguePreference" preference',
    '          JOIN "League" preference_league ON preference_league."id" = preference."leagueId"',
    '          LEFT JOIN "LeagueCompetition" competition ON competition."id" = preference_league."competitionId"',
    '          WHERE preference."profileId" = profile."id"',
    "            AND preference.\"availabilityStatus\" IN ('AVAILABLE', 'MOST_WEEKS', 'SOMETIMES')",
    '          ORDER BY preference."isPrimary" DESC, preference."createdAt" ASC',
    '        ) AS "leagueNames",',
    '        EXISTS (',
    '          SELECT 1',
    '          FROM "PlayerPoolLeaguePreference" preference',
    '          WHERE preference."profileId" = profile."id"',
    '        ) AS "hasLeaguePreferences",',
    '        profile."preferredPosition",',
  ].join("\n"),
  "captain PlayerPool league preference query",
);

replaceOnce(
  captainPage,
  [
    "  const profiles = rows.filter((profile) => {",
    "    const areaMatches =",
    "      !teamArea ||",
    "      profile.leagueId === team.leagueId ||",
    "      profile.area?.trim().toLowerCase() === teamArea;",
    "    const nightMatches = matchesNight(profile.preferredNights, teamNight);",
    "    return areaMatches && nightMatches;",
    "  });",
  ].join("\n"),
  [
    "  const profiles = rows.filter((profile) => {",
    "    if (profile.requestId) return true;",
    "",
    "    if (profile.hasLeaguePreferences) {",
    "      return Boolean(",
    "        team.leagueId && profile.leagueIds.includes(team.leagueId),",
    "      );",
    "    }",
    "",
    "    const areaMatches =",
    "      !teamArea ||",
    "      profile.leagueId === team.leagueId ||",
    "      profile.area?.trim().toLowerCase() === teamArea;",
    "    const nightMatches = matchesNight(profile.preferredNights, teamNight);",
    "    return areaMatches && nightMatches;",
    "  });",
  ].join("\n"),
  "captain PlayerPool exact league matching",
);

const oldMatchingExplanation =
  "          These players are looking for a SIXFL team and match your league area or playing night. Profiles are anonymised: names, email addresses and mobile numbers stay private until the player agrees to an introduction.";
const previousMatchingExplanation =
  "          These players have chosen your league, or are looking to play locally on the same night. Request an introduction and SIXFL will check with the player first. Their name and contact details stay private unless they agree.";
let captainSource = read(captainPage);
if (captainSource.includes(oldMatchingExplanation)) {
  captainSource = captainSource.replace(oldMatchingExplanation, previousMatchingExplanation);
  write(captainPage, captainSource);
}

replaceOnce(
  captainPage,
  [
    '                    ["Available nights", formatNights(profile.preferredNights)],',
    '                    ["Area", profile.area],',
  ].join("\n"),
  [
    '                    ["Available nights", formatNights(profile.preferredNights)],',
    '                    [',
    '                      "Selected leagues",',
    '                      profile.leagueNames.length',
    '                        ? profile.leagueNames.join(", ")',
    '                        : null,',
    '                    ],',
    '                    ["Area", profile.area],',
  ].join("\n"),
  "captain PlayerPool selected leagues display",
);

replaceOnce(
  adminPage,
  "  leagueName: string | null;",
  ["  leagueName: string | null;", "  leagueNames: string[];"].join("\n"),
  "admin PlayerPool league names type",
);

replaceOnce(
  adminPage,
  '        league."name" AS "leagueName"',
  [
    '        league."name" AS "leagueName",',
    '        ARRAY(',
    '          SELECT COALESCE(competition."name", preference_league."name")',
    '          FROM "PlayerPoolLeaguePreference" preference',
    '          JOIN "League" preference_league ON preference_league."id" = preference."leagueId"',
    '          LEFT JOIN "LeagueCompetition" competition ON competition."id" = preference_league."competitionId"',
    '          WHERE preference."profileId" = profile."id"',
    "            AND preference.\"availabilityStatus\" IN ('AVAILABLE', 'MOST_WEEKS', 'SOMETIMES')",
    '          ORDER BY preference."isPrimary" DESC, preference."createdAt" ASC',
    '        ) AS "leagueNames"',
  ].join("\n"),
  "admin PlayerPool selected league query",
);

replaceOnce(
  adminPage,
  '["League", profile.leagueName],',
  [
    '[',
    '                      "Leagues",',
    '                      profile.leagueNames.length',
    '                        ? profile.leagueNames.join(", ")',
    '                        : profile.leagueName,',
    '                    ],',
  ].join("\n"),
  "admin PlayerPool selected leagues display",
);

replaceOnce(
  leadAction,
  [
    '          "updatedAt" = NOW()',
    '      `;',
    '',
    '      return prospect;',
  ].join("\n"),
  [
    '          "updatedAt" = NOW()',
    '      `;',
    '',
    '      if (lead.leagueId) {',
    '        await tx.$executeRaw`',
    '          UPDATE "PlayerPoolLeaguePreference"',
    '          SET "isPrimary" = FALSE, "updatedAt" = NOW()',
    '          WHERE "profileId" = ${profileId}',
    '        `;',
    '',
    '        await tx.$executeRaw`',
    '          INSERT INTO "PlayerPoolLeaguePreference" (',
    '            "id", "profileId", "leagueId", "availabilityStatus",',
    '            "isPrimary", "createdAt", "updatedAt"',
    '          ) VALUES (',
    '            ${createPlayerPoolId()}, ${profileId}, ${lead.leagueId},',
    "            'AVAILABLE', TRUE, NOW(), NOW()",
    '          )',
    '          ON CONFLICT ("profileId", "leagueId") DO UPDATE SET',
    "            \"availabilityStatus\" = 'AVAILABLE',",
    '            "isPrimary" = TRUE,',
    '            "updatedAt" = NOW()',
    '        `;',
    '      }',
    '',
    '      return prospect;',
  ].join("\n"),
  "lead conversion PlayerPool league preference",
);

for (const filePath of [captainPage, adminPage]) {
  const source = read(filePath);
  if (!source.includes("PlayerPoolLeaguePreference")) {
    throw new Error(`League-aware PlayerPool query was not added to ${filePath}`);
  }
}

console.log(
  "PlayerPool profiles now match captains by selected league IDs, while legacy profiles retain the previous area/night fallback. Display copy is not used as a build anchor.",
);

require("./apply-captain-playerpool-availability-badge.cjs");
