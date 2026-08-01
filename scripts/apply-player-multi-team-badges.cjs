const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, patcher) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");
  source = patcher(source);
  fs.writeFileSync(absolutePath, source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

const helperImport =
  'import { getPlayerTeamMembershipsByUserId } from "@/lib/players/player-team-memberships";';

patchFile("src/app/(admin)/admin/teams/[id]/squad/page.tsx", (input) => {
  let source = input;

  if (!source.includes(helperImport)) {
    source = replaceRequired(
      source,
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
      `${helperImport}\nimport { formatDateTimeInLondon } from "@/lib/datetime/london";`,
      "admin multi-team membership import",
    );
  }

  if (!source.includes("const teamMembershipsByUserId =")) {
    source = replaceRequired(
      source,
      "  const captainCount = team.members.filter(",
      [
        "  const teamMembershipsByUserId =",
        "    await getPlayerTeamMembershipsByUserId(memberUserIds);",
        "",
        "  const captainCount = team.members.filter(",
      ].join("\n"),
      "admin multi-team membership query",
    );
  }

  if (!source.includes("const otherTeamMemberships = allTeamMemberships.filter")) {
    source = replaceRequired(
      source,
      "                const dashboardCopy = getDashboardStatusCopy(dashboardStatus);",
      [
        "                const dashboardCopy = getDashboardStatusCopy(dashboardStatus);",
        "                const allTeamMemberships =",
        "                  teamMembershipsByUserId.get(member.user.id) ?? [];",
        "                const otherTeamMemberships = allTeamMemberships.filter(",
        "                  (membership) => membership.teamId !== team.id,",
        "                );",
      ].join("\n"),
      "admin member multi-team lookup",
    );
  }

  const adminRoleBadge = [
    "                          <span",
    "                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(",
    "                              member.role,",
    "                            )}`}",
    "                          >",
    "                            {getRoleLabel(member.role)}",
    "                          </span>",
  ].join("\n");
  const adminRoleBadgeWithTeams = [
    adminRoleBadge,
    "                          {allTeamMemberships.length > 1 ? (",
    '                            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">',
    "                              Registered for {allTeamMemberships.length} teams",
    "                            </span>",
    "                          ) : null}",
  ].join("\n");
  source = replaceRequired(
    source,
    adminRoleBadge,
    adminRoleBadgeWithTeams,
    "admin multi-team badge",
  );

  const adminEmailBlock = [
    '                        <div className="mt-2 text-sm text-white/65">',
    '                          {member.user.email || "No email on account"}',
    "                        </div>",
    "",
    '                        <div className="mt-1 text-xs text-white/45">',
  ].join("\n");
  const adminEmailBlockWithTeams = [
    '                        <div className="mt-2 text-sm text-white/65">',
    '                          {member.user.email || "No email on account"}',
    "                        </div>",
    "",
    "                        {otherTeamMemberships.length > 0 ? (",
    '                          <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2.5 text-xs leading-5 text-violet-50/85">',
    '                            <div className="font-semibold text-violet-100">',
    "                              This is one account registered for {allTeamMemberships.length} teams",
    "                            </div>",
    '                            <div className="mt-1 space-y-1">',
    "                              {allTeamMemberships.map((membership) => {",
    "                                const leagueContext = [",
    "                                  membership.leagueName,",
    "                                  membership.leagueSeason,",
    "                                ]",
    "                                  .filter(Boolean)",
    '                                  .join(" · ");',
    "                                return (",
    "                                  <div key={membership.membershipId}>",
    "                                    {membership.teamName}",
    "                                    {leagueContext ? ` · ${leagueContext}` : \"\"}",
    "                                  </div>",
    "                                );",
    "                              })}",
    "                            </div>",
    "                          </div>",
    "                        ) : null}",
    "",
    '                        <div className="mt-1 text-xs text-white/45">',
  ].join("\n");
  source = replaceRequired(
    source,
    adminEmailBlock,
    adminEmailBlockWithTeams,
    "admin multi-team details panel",
  );

  return source;
});

patchFile("src/app/captain/team/[teamid]/captain-squad/page.tsx", (input) => {
  let source = input;

  if (!source.includes(helperImport)) {
    source = replaceRequired(
      source,
      'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";',
      [
        helperImport,
        'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";',
      ].join("\n"),
      "captain multi-team membership import",
    );
  }

  if (!source.includes("await getPlayerTeamMembershipsByUserId(userIds)")) {
    source = replaceRequired(
      source,
      "  const usesWhatsappByUserId = new Map(",
      [
        "  const teamMembershipsByUserId =",
        "    await getPlayerTeamMembershipsByUserId(userIds);",
        "",
        "  const usesWhatsappByUserId = new Map(",
      ].join("\n"),
      "captain multi-team membership query",
    );
  }

  if (!source.includes("const otherTeamMemberships = allTeamMemberships.filter")) {
    source = replaceRequired(
      source,
      "              const playerStats = statsByMemberId.get(member.id) ?? emptyPlayerStats();",
      [
        "              const playerStats = statsByMemberId.get(member.id) ?? emptyPlayerStats();",
        "              const allTeamMemberships =",
        "                teamMembershipsByUserId.get(member.user.id) ?? [];",
        "              const otherTeamMemberships = allTeamMemberships.filter(",
        "                (membership) => membership.teamId !== team.id,",
        "              );",
      ].join("\n"),
      "captain member multi-team lookup",
    );
  }

  const captainRoleBadge = [
    '                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>',
    "                          {getRoleLabel(member.role)}",
    "                        </span>",
  ].join("\n");
  const captainRoleBadgeWithTeams = [
    captainRoleBadge,
    "                        {allTeamMemberships.length > 1 ? (",
    '                          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">',
    "                            Registered for {allTeamMemberships.length} teams",
    "                          </span>",
    "                        ) : null}",
  ].join("\n");
  source = replaceRequired(
    source,
    captainRoleBadge,
    captainRoleBadgeWithTeams,
    "captain multi-team badge",
  );

  const captainAddedBlock = [
    '                      <div className="mt-1 text-xs text-white/45">',
    "                        Added {formatUkDate(member.createdAt)}",
    '                        {member.user.email ? ` · ${member.user.email}` : " · No email saved"}',
    "                      </div>",
    '                      <div className="mt-3 flex flex-wrap gap-2">',
  ].join("\n");
  const captainAddedBlockWithTeams = [
    '                      <div className="mt-1 text-xs text-white/45">',
    "                        Added {formatUkDate(member.createdAt)}",
    '                        {member.user.email ? ` · ${member.user.email}` : " · No email saved"}',
    "                      </div>",
    "                      {otherTeamMemberships.length > 0 ? (",
    '                        <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2.5 text-xs leading-5 text-violet-50/85">',
    '                          <div className="font-semibold text-violet-100">',
    "                            Also registered with",
    "                          </div>",
    '                          <div className="mt-1 space-y-1">',
    "                            {otherTeamMemberships.map((membership) => {",
    "                              const leagueContext = [",
    "                                membership.leagueName,",
    "                                membership.leagueSeason,",
    "                              ]",
    "                                .filter(Boolean)",
    '                                .join(" · ");',
    "                              return (",
    "                                <div key={membership.membershipId}>",
    "                                  {membership.teamName}",
    "                                  {leagueContext ? ` · ${leagueContext}` : \"\"}",
    "                                </div>",
    "                              );",
    "                            })}",
    "                          </div>",
    "                        </div>",
    "                      ) : null}",
    '                      <div className="mt-3 flex flex-wrap gap-2">',
  ].join("\n");
  source = replaceRequired(
    source,
    captainAddedBlock,
    captainAddedBlockWithTeams,
    "captain multi-team details panel",
  );

  return source;
});

const captainSource = fs.readFileSync(
  path.join(root, "src/app/captain/team/[teamid]/captain-squad/page.tsx"),
  "utf8",
);
const adminSource = fs.readFileSync(
  path.join(root, "src/app/(admin)/admin/teams/[id]/squad/page.tsx"),
  "utf8",
);

if (
  !captainSource.includes("Registered for {allTeamMemberships.length} teams") ||
  !captainSource.includes("Also registered with") ||
  !adminSource.includes("This is one account registered for")
) {
  throw new Error("Player multi-team registration badges were not applied correctly.");
}

console.log(
  "Players with one account across multiple teams are clearly labelled in admin and manager squad views.",
);
