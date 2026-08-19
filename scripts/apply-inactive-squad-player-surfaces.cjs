const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function ensureImport(source, importLine, anchor, label) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) throw new Error(`${label} import anchor not found.`);
  return source.replace(anchor, `${importLine}\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} anchor not found.`);
  return source.replace(before, after);
}

// Captain squad: keep historic players visible, but clearly distinguish them from
// the current active squad and explain how the status affects Squad payments.
{
  const file = "src/app/captain/team/[teamid]/captain-squad/page.tsx";
  let source = read(file);
  const importLine = 'import { getTeamMemberSquadStatusMap } from "@/lib/managed-squad/squadStatus";';
  source = ensureImport(
    source,
    importLine,
    'import { prisma } from "@/lib/prisma";',
    "Captain squad inactive status",
  );

  if (!source.includes("squadStatusByMemberIdForCaptainSquad")) {
    const anchor = `  const usesWhatsappByUserId = new Map(
    whatsappRows.map((row) => [row.id, Boolean(row.usesWhatsapp)]),
  );`;
    if (!source.includes(anchor)) throw new Error("Captain squad status-map anchor not found.");
    source = source.replace(
      anchor,
      `  const squadStatusByMemberIdForCaptainSquad = await getTeamMemberSquadStatusMap(teamid);\n\n${anchor}`,
    );
  }

  if (!source.includes("activeMembersForCaptainSquad")) {
    const countAnchor = `  const organiserCount = team.members.filter((member) =>
    ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role),
  ).length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const backupCount = team.members.filter((member) => member.role === "BACKUP_PLAYER").length;
  const totalSquadCount = team.members.length;`;
    const replacement = `  const activeMembersForCaptainSquad = team.members.filter(
    (member) => squadStatusByMemberIdForCaptainSquad.get(member.id)?.squadStatus !== "INACTIVE",
  );
  const inactiveMemberCount = team.members.length - activeMembersForCaptainSquad.length;
  const organiserCount = activeMembersForCaptainSquad.filter((member) =>
    ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role),
  ).length;
  const playerCount = activeMembersForCaptainSquad.filter((member) => member.role === "PLAYER").length;
  const backupCount = activeMembersForCaptainSquad.filter((member) => member.role === "BACKUP_PLAYER").length;
  const totalSquadCount = activeMembersForCaptainSquad.length;`;
    source = replaceRequired(source, countAnchor, replacement, "Captain squad active counts");
  }

  if (!source.includes("Historic players can stay on SIXFL without blocking Squad payments")) {
    const sectionAnchor = `      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">`;
    const guidance = `      <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80">
        <span className="font-semibold text-white">Historic players can stay on SIXFL without blocking Squad payments.</span>{" "}
        If someone no longer plays, choose <span className="font-semibold text-white">Edit player</span> and mark them <span className="font-semibold text-white">Inactive</span>. Their old matches, statistics and payments remain in the system, but they are removed from current availability, fixture selection and Squad payments.
        {inactiveMemberCount > 0 ? (
          <span className="mt-2 block text-sky-100/60">
            {inactiveMemberCount} historic/inactive player{inactiveMemberCount === 1 ? " is" : "s are"} currently kept on this team.
          </span>
        ) : null}
      </section>\n\n${sectionAnchor}`;
    source = replaceRequired(source, sectionAnchor, guidance, "Captain squad inactive guidance");
  }

  if (!source.includes("isInactiveCaptainSquadMember")) {
    const mapAnchor = `            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);`;
    const mapReplacement = `            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);
              const isInactiveCaptainSquadMember =
                squadStatusByMemberIdForCaptainSquad.get(member.id)?.squadStatus === "INACTIVE";`;
    source = replaceRequired(source, mapAnchor, mapReplacement, "Captain squad inactive row state");

    const badgeAnchor = `                        <span className={\`rounded-full border px-2.5 py-1 text-[11px] font-medium \${getRoleBadgeClasses(member.role)}\`}>
                          {getRoleLabel(member.role)}
                        </span>
                        {whatsAppUrl ? <WhatsAppLink href={whatsAppUrl} playerName={playerName} /> : null}`;
    const badgeReplacement = `                        <span className={\`rounded-full border px-2.5 py-1 text-[11px] font-medium \${getRoleBadgeClasses(member.role)}\`}>
                          {getRoleLabel(member.role)}
                        </span>
                        {isInactiveCaptainSquadMember ? (
                          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/50">
                            Inactive · history kept
                          </span>
                        ) : null}
                        {whatsAppUrl ? <WhatsAppLink href={whatsAppUrl} playerName={playerName} /> : null}`;
    source = replaceRequired(source, badgeAnchor, badgeReplacement, "Captain squad inactive badge");
  }

  write(file, source);
}

// Availability: inactive historic players are not part of current fixture responses,
// counts or chase controls. Historic availability records remain stored untouched.
{
  const file = "src/app/captain/team/[teamid]/availability/page.tsx";
  let source = read(file);

  if (!source.includes("activeMembersForAvailability")) {
    const anchor = `  const smsDispatchBySourceId = new Map<string, (typeof smsDispatches)[number]>();`;
    if (!source.includes(anchor)) throw new Error("Availability active-member anchor not found.");
    source = source.replace(
      anchor,
      `  const activeMembersForAvailability = team.members.filter(
    (member) => squadStatusByMemberId.get(member.id)?.squadStatus !== "INACTIVE",
  );\n\n${anchor}`,
    );
  }

  source = source
    .replace("    return team.members.map((member) =>", "    return activeMembersForAvailability.map((member) =>")
    .replace(
      `{team.members.length} squad member\n                {team.members.length === 1 ? "" : "s"}`,
      `{activeMembersForAvailability.length} active squad member\n                {activeMembersForAvailability.length === 1 ? "" : "s"}`,
    )
    .replace("          const fixtureResponses = team.members.map((member) =>", "          const fixtureResponses = activeMembersForAvailability.map((member) =>")
    .replace("                {team.members.map((member) => {", "                {activeMembersForAvailability.map((member) => {");

  if (!source.includes("activeMembersForAvailability.map((member) =>")) {
    throw new Error("Availability inactive-player filters were not applied.");
  }

  write(file, source);
}

// Fixture selection: inactive historic players do not appear in current selection,
// do not contribute to selection counts, and stale forms cannot re-select them.
{
  const pageFile = "src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/page.tsx";
  let page = read(pageFile);

  if (!page.includes("activeMembersForSelection")) {
    const anchor = `  const availabilityByMemberId = new Map(
    fixture.availabilities.map((item) => [item.teamMemberId, item]),
  );`;
    if (!page.includes(anchor)) throw new Error("Fixture selection active-member anchor not found.");
    page = page.replace(
      anchor,
      `  const activeMembersForSelection = team.members.filter(
    (member) => squadStatusByMemberId.get(member.id)?.squadStatus !== "INACTIVE",
  );\n\n${anchor}`,
    );
  }

  page = page
    .replace(
      `      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INJURED",`,
      `      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INJURED" &&
      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INACTIVE",`,
    )
    .replace(
      `      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INJURED",`,
      `      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INJURED" &&
      squadStatusByMemberId.get(item.teamMemberId)?.squadStatus !== "INACTIVE",`,
    )
    .replace("                {team.members.length}", "                {activeMembersForSelection.length}")
    .replace("          {team.members.map((member) => {", "          {activeMembersForSelection.map((member) => {");

  if (!page.includes("activeMembersForSelection.map((member) =>")) {
    throw new Error("Fixture selection inactive-player filters were not applied.");
  }

  write(pageFile, page);

  const actionFile = "src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/actions.ts";
  let action = read(actionFile);
  const importLine = 'import { getTeamMemberSquadStatusMap } from "@/lib/managed-squad/squadStatus";';
  action = ensureImport(
    action,
    importLine,
    'import { upsertNotificationRecipient } from "@/lib/notifications/recipients";',
    "Fixture selection inactive status",
  );

  if (!action.includes("inactive players cannot be selected for current fixtures")) {
    const anchor = `  if (!membership) {
    redirect(buildSelectionRedirect(teamid, fixtureId, "?error=Team%20member%20not%20found."));
  }`;
    const replacement = `${anchor}

  const squadStatusByMemberId = await getTeamMemberSquadStatusMap(teamid);
  // Inactive historic players remain attached to old records, but inactive players cannot be selected for current fixtures.
  if (squadStatusByMemberId.get(teamMemberId)?.squadStatus === "INACTIVE") {
    redirect(
      buildSelectionRedirect(
        teamid,
        fixtureId,
        "?error=This%20historic%20player%20is%20inactive.%20Mark%20them%20active%20before%20selecting%20them.",
      ),
    );
  }`;
    action = replaceRequired(action, anchor, replacement, "Fixture selection stale inactive guard");
  }

  write(actionFile, action);
}

console.log("Inactive squad players are excluded from current payments, availability and fixture selection while remaining in team history.");
