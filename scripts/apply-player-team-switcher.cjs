const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/player/team/[teamid]/page.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

const oldMembershipSelect = [
  "      teamMembers: {",
  "        where: { teamId: teamid },",
  "        select: {",
  "          id: true,",
  "          role: true,",
  "          user: { select: { email: true, name: true } },",
  "          team: { select: teamSelect },",
  "        },",
  "        take: 1,",
  "      },",
].join("\n");

const allMembershipSelect = [
  "      teamMembers: {",
  '        orderBy: { createdAt: "asc" },',
  "        select: {",
  "          id: true,",
  "          userId: true,",
  "          role: true,",
  "          user: { select: { email: true, name: true } },",
  "          team: { select: teamSelect },",
  "        },",
  "      },",
].join("\n");

if (source.includes(oldMembershipSelect)) {
  source = source.replace(oldMembershipSelect, allMembershipSelect);
}

const oldPreviewSelect = [
  "        select: {",
  "          id: true,",
  "          role: true,",
  "          user: { select: { email: true, name: true } },",
  "          team: { select: teamSelect },",
  "        },",
].join("\n");

const previewSelectWithUserId = [
  "        select: {",
  "          id: true,",
  "          userId: true,",
  "          role: true,",
  "          user: { select: { email: true, name: true } },",
  "          team: { select: teamSelect },",
  "        },",
].join("\n");

if (!source.includes("previewMembership.userId") && source.includes(oldPreviewSelect)) {
  source = source.replace(oldPreviewSelect, previewSelectWithUserId);
}

const oldMembershipChoice =
  "  const membership = previewMembership ?? user.teamMembers[0] ?? null;";
const newMembershipChoice = [
  "  const membership =",
  "    previewMembership ??",
  "    user.teamMembers.find((candidate) => candidate.team.id === teamid) ??",
  "    null;",
].join("\n");

if (source.includes(oldMembershipChoice)) {
  source = source.replace(oldMembershipChoice, newMembershipChoice);
}

const teamAnchor = [
  "  const team =",
  "    membership?.team ??",
  "    (await prisma.team.findUnique({ where: { id: teamid }, select: teamSelect }));",
].join("\n");

const membershipsAndTeam = [
  "  const playerMemberships = (",
  "    previewMembership",
  "      ? await prisma.teamMember.findMany({",
  "          where: { userId: previewMembership.userId },",
  '          orderBy: { createdAt: "asc" },',
  "          select: {",
  "            id: true,",
  "            userId: true,",
  "            role: true,",
  "            user: { select: { email: true, name: true } },",
  "            team: { select: teamSelect },",
  "          },",
  "        })",
  "      : user.teamMembers",
  "  )",
  "    .slice()",
  "    .sort((a, b) => a.team.name.localeCompare(b.team.name));",
  "",
  teamAnchor,
].join("\n");

if (!source.includes("const playerMemberships = (") && source.includes(teamAnchor)) {
  source = source.replace(teamAnchor, membershipsAndTeam);
}

const headerEnd = [
  "              <Link",
  '                href="/api/auth/signout"',
  '                className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"',
  "              >",
  "                Sign out",
  "              </Link>",
  "            </div>",
  "          </div>",
  "        </section>",
].join("\n");

const headerWithSwitcher = [
  "              <Link",
  '                href="/api/auth/signout"',
  '                className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"',
  "              >",
  "                Sign out",
  "              </Link>",
  "            </div>",
  "          </div>",
  "",
  "          {playerMemberships.length > 1 ? (",
  '            <div className="mt-6 border-t border-white/10 pt-6">',
  '              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">',
  "                <div>",
  '                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">',
  "                    Your teams",
  "                  </p>",
  '                  <h2 className="mt-2 text-lg font-semibold text-white">Switch team</h2>',
  '                  <p className="mt-1 text-sm text-white/60">',
  "                    You are registered for {playerMemberships.length} teams. Each team has its own fixtures, availability and match fees.",
  "                  </p>",
  "                </div>",
  '                <span className="w-fit rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100">',
  "                  {playerMemberships.length} teams",
  "                </span>",
  "              </div>",
  "",
  '              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
  "                {playerMemberships.map((teamMembership) => {",
  "                  const isCurrentTeam = teamMembership.team.id === teamid;",
  "                  const switchHref = previewMembershipId",
  "                    ? `/player/team/${teamMembership.team.id}?previewMembershipId=${teamMembership.id}`",
  "                    : `/player/team/${teamMembership.team.id}`;",
  "                  const leagueLabel = [",
  "                    teamMembership.team.league?.name,",
  "                    teamMembership.team.league?.season,",
  "                  ]",
  "                    .filter(Boolean)",
  '                    .join(" · ");',
  "",
  "                  const card = (",
  '                    <div className="flex min-w-0 items-center gap-3">',
  '                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">',
  "                        {teamMembership.team.logoUrl ? (",
  "                          <img",
  "                            src={teamMembership.team.logoUrl}",
  "                            alt={`${teamMembership.team.name} badge`}",
  '                            className="h-full w-full object-cover"',
  "                          />",
  "                        ) : (",
  '                          <span className="text-sm font-black text-white/80">',
  "                            {getTeamInitials(teamMembership.team.name)}",
  "                          </span>",
  "                        )}",
  "                      </div>",
  '                      <div className="min-w-0 flex-1">',
  '                        <div className="truncate font-semibold text-white">',
  "                          {teamMembership.team.name}",
  "                        </div>",
  '                        <div className="mt-0.5 truncate text-xs text-white/50">',
  "                          {leagueLabel || \"No league assigned\"} · {getRoleLabel(teamMembership.role)}",
  "                        </div>",
  "                      </div>",
  '                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${',
  "                        isCurrentTeam",
  '                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"',
  '                          : "border-white/10 bg-white/5 text-white/65"',
  "                      }`}>",
  "                        {isCurrentTeam ? \"Current team\" : \"Open team\"}",
  "                      </span>",
  "                    </div>",
  "                  );",
  "",
  "                  return isCurrentTeam ? (",
  "                    <div",
  "                      key={teamMembership.id}",
  '                      aria-current="page"',
  '                      className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4"',
  "                    >",
  "                      {card}",
  "                    </div>",
  "                  ) : (",
  "                    <Link",
  "                      key={teamMembership.id}",
  "                      href={switchHref}",
  '                      className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-violet-300/35 hover:bg-violet-500/10"',
  "                    >",
  "                      {card}",
  "                    </Link>",
  "                  );",
  "                })}",
  "              </div>",
  "            </div>",
  "          ) : null}",
  "        </section>",
].join("\n");

if (!source.includes("You are registered for {playerMemberships.length} teams") && source.includes(headerEnd)) {
  source = source.replace(headerEnd, headerWithSwitcher);
}

fs.writeFileSync(absolutePath, source, "utf8");

if (
  !source.includes("const playerMemberships = (") ||
  !source.includes("Switch team") ||
  !source.includes("previewMembershipId=${teamMembership.id}") ||
  source.includes("where: { teamId: teamid },\n        select")
) {
  throw new Error("Player multi-team switcher was not applied correctly.");
}

console.log(
  "Players registered for multiple teams can switch between team dashboards while keeping fixtures, availability and fees separate.",
);
