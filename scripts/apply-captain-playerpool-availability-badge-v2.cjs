const fs = require("node:fs");
const path = require("node:path");
const filePath = path.join(process.cwd(), "src/app/captain/team/[teamid]/layout.tsx");
let source = fs.readFileSync(filePath, "utf8");
function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Could not find ${label}`);
  source = source.replace(oldText, newText);
}
replaceOnce(
  "  unreadCount?: number;\n};",
  "  unreadCount?: number;\n  availabilityCount?: number;\n};",
  "CaptainNavItem availabilityCount field",
);
replaceOnce(
  "  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);",
  `  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);\n  const playerPoolAvailableRows = team.league?.id\n    ? await prisma.$queryRaw<Array<{ count: bigint }>>\`\n        SELECT COUNT(*)::bigint AS "count"\n        FROM "PlayerPoolProfile" profile\n        JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"\n        WHERE profile."leagueId" = \${team.league.id}\n          AND profile."status" = 'AVAILABLE'\n          AND profile."profileSubmittedAt" IS NOT NULL\n          AND profile."consentShareProfile" = true\n          AND profile."consentContact" = true\n          AND NOT EXISTS (\n            SELECT 1 FROM "TeamPlayerProspect" squad_prospect\n            WHERE squad_prospect."teamId" = \${teamid}\n              AND squad_prospect."email" IS NOT NULL\n              AND prospect."email" IS NOT NULL\n              AND LOWER(TRIM(squad_prospect."email")) = LOWER(TRIM(prospect."email"))\n          )\n          AND NOT EXISTS (\n            SELECT 1\n            FROM "TeamMember" squad_member\n            JOIN "User" squad_user ON squad_user."id" = squad_member."userId"\n            WHERE squad_member."teamId" = \${teamid}\n              AND squad_user."email" IS NOT NULL\n              AND prospect."email" IS NOT NULL\n              AND LOWER(TRIM(squad_user."email")) = LOWER(TRIM(prospect."email"))\n          )\n      \`\n    : [];\n  const playerPoolAvailableCount = Number(playerPoolAvailableRows[0]?.count ?? 0);`,
  "PlayerPool availability count query",
);
replaceOnce(
  '        { href: `/captain/team/${teamid}/player-pool`, label: "PlayerPool" },',
  `        {\n          href: \`/captain/team/\${teamid}/player-pool\`,\n          label: "PlayerPool",\n          availabilityCount: playerPoolAvailableCount,\n        },`,
  "PlayerPool nav item",
);
replaceOnce(
  "                          : item.label\n                      }",
  "                          : item.availabilityCount && item.availabilityCount > 0\n                            ? `${item.label}, ${item.availabilityCount} player${item.availabilityCount === 1 ? \"\" : \"s\"} available in your league`\n                            : item.label\n                      }",
  "PlayerPool accessible availability label",
);
const badgeAnchor = `                      {item.unreadCount && item.unreadCount > 0 ? (\n                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[11px] font-black text-black">\n                          {item.unreadCount}\n                        </span>\n                      ) : null}`;
replaceOnce(
  badgeAnchor,
  `${badgeAnchor}\n                      {item.availabilityCount && item.availabilityCount > 0 ? (\n                        <span className="inline-flex items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-100">\n                          {item.availabilityCount} available\n                        </span>\n                      ) : null}`,
  "PlayerPool availability badge",
);
fs.writeFileSync(filePath, source);
console.log("Captain PlayerPool nav now shows available players in the team's league.");
