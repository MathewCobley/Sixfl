const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);

let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
  [
    "type CaptainNavItem = {",
    "  href: string;",
    "  label: string;",
    "  logoSrc?: string;",
    "  unreadCount?: number;",
    "};",
  ].join("\n"),
  [
    "type CaptainNavItem = {",
    "  href: string;",
    "  label: string;",
    "  logoSrc?: string;",
    "  unreadCount?: number;",
    "  availabilityCount?: number;",
    "};",
  ].join("\n"),
  "CaptainNavItem availabilityCount field",
);

replaceOnce(
  "  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);",
  [
    "  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);",
    "  const playerPoolAvailableRows = team.league?.id",
    "    ? await prisma.$queryRaw<Array<{ count: bigint }>>`",
    "        SELECT COUNT(*)::bigint AS \"count\"",
    "        FROM \"PlayerPoolProfile\" profile",
    "        JOIN \"TeamPlayerProspect\" prospect ON prospect.\"id\" = profile.\"prospectId\"",
    "        WHERE profile.\"status\" = 'AVAILABLE'",
    "          AND profile.\"profileSubmittedAt\" IS NOT NULL",
    "          AND profile.\"consentShareProfile\" = true",
    "          AND profile.\"consentContact\" = true",
    "          AND (",
    "            EXISTS (",
    "              SELECT 1",
    "              FROM \"PlayerPoolLeaguePreference\" preference",
    "              WHERE preference.\"profileId\" = profile.\"id\"",
    "                AND preference.\"leagueId\" = ${team.league.id}",
    "                AND preference.\"availabilityStatus\" IN ('AVAILABLE', 'MOST_WEEKS', 'SOMETIMES')",
    "            )",
    "            OR (",
    "              NOT EXISTS (",
    "                SELECT 1",
    "                FROM \"PlayerPoolLeaguePreference\" preference",
    "                WHERE preference.\"profileId\" = profile.\"id\"",
    "              )",
    "              AND profile.\"leagueId\" = ${team.league.id}",
    "            )",
    "          )",
    "          AND NOT EXISTS (",
    "            SELECT 1",
    "            FROM \"TeamPlayerProspect\" squad_prospect",
    "            WHERE squad_prospect.\"teamId\" = ${teamid}",
    "              AND squad_prospect.\"email\" IS NOT NULL",
    "              AND prospect.\"email\" IS NOT NULL",
    "              AND LOWER(TRIM(squad_prospect.\"email\")) = LOWER(TRIM(prospect.\"email\"))",
    "          )",
    "          AND NOT EXISTS (",
    "            SELECT 1",
    "            FROM \"TeamMember\" squad_member",
    "            JOIN \"User\" squad_user ON squad_user.\"id\" = squad_member.\"userId\"",
    "            WHERE squad_member.\"teamId\" = ${teamid}",
    "              AND squad_user.\"email\" IS NOT NULL",
    "              AND prospect.\"email\" IS NOT NULL",
    "              AND LOWER(TRIM(squad_user.\"email\")) = LOWER(TRIM(prospect.\"email\"))",
    "          )",
    "      `",
    "    : [];",
    "  const playerPoolAvailableCount = Number(playerPoolAvailableRows[0]?.count ?? 0);",
  ].join("\n"),
  "PlayerPool availability count query",
);

replaceOnce(
  '        { href: `/captain/team/${teamid}/player-pool`, label: "PlayerPool" },',
  [
    "        {",
    "          href: `/captain/team/${teamid}/player-pool`,",
    '          label: "PlayerPool",',
    "          availabilityCount: playerPoolAvailableCount,",
    "        },",
  ].join("\n"),
  "PlayerPool nav item",
);

replaceOnce(
  [
    "                      aria-label={",
    "                        item.unreadCount && item.unreadCount > 0",
    "                          ? `${item.label}, ${item.unreadCount} unread`",
    "                          : item.label",
    "                      }",
  ].join("\n"),
  [
    "                      aria-label={",
    "                        item.unreadCount && item.unreadCount > 0",
    "                          ? `${item.label}, ${item.unreadCount} unread`",
    "                          : item.availabilityCount && item.availabilityCount > 0",
    "                            ? `${item.label}, ${item.availabilityCount} player${item.availabilityCount === 1 ? \"\" : \"s\"} available in your league`",
    "                            : item.label",
    "                      }",
  ].join("\n"),
  "PlayerPool accessible availability label",
);

const unreadBadgeAnchor = [
  "                          {item.unreadCount && item.unreadCount > 0 ? (",
  "                            <span",
  '                              aria-hidden="true"',
  '                              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[11px] font-bold leading-none text-black"',
  "                            >",
  "                              {item.unreadCount}",
  "                            </span>",
  "                          ) : null}",
].join("\n");

const availabilityBadge = [
  "                          {item.availabilityCount && item.availabilityCount > 0 ? (",
  "                            <span",
  '                              aria-hidden="true"',
  '                              className="inline-flex items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black text-emerald-100"',
  "                            >",
  "                              {item.availabilityCount} available",
  "                            </span>",
  "                          ) : null}",
].join("\n");

if (!source.includes(availabilityBadge)) {
  if (!source.includes(unreadBadgeAnchor)) {
    throw new Error("Could not find PlayerPool availability badge insertion point");
  }
  source = source.replace(
    unreadBadgeAnchor,
    [unreadBadgeAnchor, availabilityBadge].join("\n"),
  );
}

fs.writeFileSync(filePath, source);
console.log("Captain PlayerPool nav now shows available players in the team's league.");
