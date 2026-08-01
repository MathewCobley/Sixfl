const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionPath = "src/app/captain/team/[teamid]/squad/edit-actions.ts";
const pagePath = "src/app/captain/team/[teamid]/squad/[membershipId]/edit/page.tsx";

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

let action = read(actionPath);

action = replaceRequired(
  action,
  "  if (Number.isNaN(playerMatchFeeOverride)) {",
  "  if (access.isAdmin && Number.isNaN(playerMatchFeeOverride)) {",
  "admin-only override validation",
);

action = replaceRequired(
  action,
  "    Array<{ sourceProspectId: string | null }>",
  "    Array<{\n      sourceProspectId: string | null;\n      playerMatchFeePenceOverride: number | null;\n    }>",
  "existing override query type",
);

action = replaceRequired(
  action,
  '    SELECT "sourceProspectId"\n    FROM "TeamMemberProfile"',
  '    SELECT "sourceProspectId", "playerMatchFeePenceOverride"\n    FROM "TeamMemberProfile"',
  "existing override query",
);

action = replaceRequired(
  action,
  "  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;\n\n  await prisma.$transaction(async (tx) => {",
  [
    "  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;",
    "  const existingPlayerMatchFeeOverride =",
    "    existingProfiles[0]?.playerMatchFeePenceOverride ?? null;",
    "  const nextPlayerMatchFeeOverride = access.isAdmin",
    "    ? playerMatchFeeOverride",
    "    : existingPlayerMatchFeeOverride;",
    "  const playerMatchFeeOverrideChanged =",
    "    access.isAdmin &&",
    "    existingPlayerMatchFeeOverride !== nextPlayerMatchFeeOverride;",
    "",
    "  await prisma.$transaction(async (tx) => {",
  ].join("\n"),
  "admin-only override calculation",
);

action = replaceRequired(
  action,
  "        ${playerMatchFeeOverride},\n        ${preferredPositions},",
  "        ${nextPlayerMatchFeeOverride},\n        ${preferredPositions},",
  "protected override persistence",
);

action = replaceRequired(
  action,
  "    if (sourceProspectId) {",
  [
    "    if (playerMatchFeeOverrideChanged) {",
    "      await tx.$executeRawUnsafe(`",
    "        CREATE TABLE IF NOT EXISTS \"TeamMemberFeeOverrideAudit\" (",
    "          \"id\" TEXT NOT NULL,",
    "          \"teamMemberId\" TEXT NOT NULL,",
    "          \"teamId\" TEXT NOT NULL,",
    "          \"oldAmountPence\" INTEGER,",
    "          \"newAmountPence\" INTEGER,",
    "          \"changedByUserId\" TEXT,",
    "          \"changedByEmail\" TEXT,",
    "          \"source\" TEXT NOT NULL,",
    "          \"reason\" TEXT,",
    "          \"changedAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "          CONSTRAINT \"TeamMemberFeeOverrideAudit_pkey\" PRIMARY KEY (\"id\")",
    "        );",
    "      `);",
    "",
    "      await tx.$executeRaw`",
    "        INSERT INTO \"TeamMemberFeeOverrideAudit\" (",
    "          \"id\",",
    "          \"teamMemberId\",",
    "          \"teamId\",",
    "          \"oldAmountPence\",",
    "          \"newAmountPence\",",
    "          \"changedByUserId\",",
    "          \"changedByEmail\",",
    "          \"source\",",
    "          \"reason\",",
    "          \"changedAt\"",
    "        ) VALUES (",
    "          ${randomUUID()},",
    "          ${membershipId},",
    "          ${teamid},",
    "          ${existingPlayerMatchFeeOverride},",
    "          ${nextPlayerMatchFeeOverride},",
    "          ${access.user?.id ?? null},",
    "          ${access.user?.email ?? null},",
    "          ${\"ADMIN_PLAYER_EDIT\"},",
    "          ${\"Administrator changed player match fee override\"},",
    "          NOW()",
    "        )",
    "      `;",
    "    }",
    "",
    "    if (sourceProspectId) {",
  ].join("\n"),
  "override audit write",
);

write(actionPath, action);

let page = read(pagePath);
page = replaceRequired(
  page,
  "  await requireCaptain(teamid);",
  "  const access = await requireCaptain(teamid);",
  "captain access result",
);

const feeBlock = [
  "          <div>",
  "            <p className=\"text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45\">",
  "              Match fee setting",
  "            </p>",
  "            <div className=\"mt-4 grid gap-4 md:grid-cols-2\">",
  "              <Field",
  "                label=\"Player fee override\"",
  "                name=\"playerMatchFeeOverride\"",
  "                type=\"number\"",
  "                defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}",
  "                placeholder=\"Leave blank to use the team default\"",
  "                help=\"Use 0 for a free player. Leave blank to use the default amount on the squad payments page.\"",
  "              />",
  "            </div>",
  "          </div>",
].join("\n");

const adminFeeBlock = [
  "          {access.isAdmin ? (",
  "            <div>",
  "              <p className=\"text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45\">",
  "                Match fee setting · Admin only",
  "              </p>",
  "              <div className=\"mt-4 grid gap-4 md:grid-cols-2\">",
  "                <Field",
  "                  label=\"Player fee override\"",
  "                  name=\"playerMatchFeeOverride\"",
  "                  type=\"number\"",
  "                  defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}",
  "                  placeholder=\"Leave blank to use the team default\"",
  "                  help=\"Admin-only setting. Use 0 for a free player. Every change is recorded in the audit log.\"",
  "                />",
  "              </div>",
  "            </div>",
  "          ) : null}",
].join("\n");

page = replaceRequired(page, feeBlock, adminFeeBlock, "admin-only override field");
write(pagePath, page);

if (!read(actionPath).includes("playerMatchFeeOverrideChanged")) {
  throw new Error("Server-side admin-only override protection was not applied.");
}
if (!read(pagePath).includes("Match fee setting · Admin only")) {
  throw new Error("Admin-only override field was not applied.");
}

console.log(
  "Restricted player fee overrides to admins and added an audit record for every change.",
);
