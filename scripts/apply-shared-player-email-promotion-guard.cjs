const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(filePath(relativePath), source, "utf8");
}

function addImport(source, label) {
  const before = 'import { prisma } from "@/lib/prisma";';
  const after = [
    'import { promoteProspectToTeamMember } from "@/lib/players/promote-prospect-to-member";',
    before,
  ].join("\n");

  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected Prisma import was not found for ${label}.`);
  }
  return source.replace(before, after);
}

function replaceFinalFunction(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`Expected ${label} function was not found.`);
  }
  return `${source.slice(0, index)}${replacement}\n`;
}

{
  const file = "src/app/(admin)/admin/teams/[id]/prospects/actions.ts";
  let source = addImport(read(file), "admin prospect promotion");
  const replacement = `export async function convertAdminProspectToMemberAction(formData: FormData) {
  const access = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  if (!teamId || !prospectId) redirect("/admin/teams");

  const result = await promoteProspectToTeamMember({
    teamId,
    prospectId,
    attemptedByUserId: access.user?.id ?? null,
    attemptedByEmail: access.user?.email ?? access.session?.user?.email ?? null,
    source: "ADMIN_PROSPECT_PROMOTED",
  });

  revalidatePath(\`/admin/teams/\${teamId}\`);
  revalidatePath(\`/admin/teams/\${teamId}/squad\`);
  revalidatePath(\`/admin/teams/\${teamId}/prospects\`);
  revalidatePath(\`/captain/team/\${teamId}/squad\`);
  revalidatePath(\`/captain/team/\${teamId}/prospects\`);
  revalidatePath("/admin/player-prospects");

  if (!result.ok) {
    redirect(buildRedirect(teamId, \`?error=\${encodeURIComponent(result.message)}\`));
  }

  redirect(
    buildRedirect(
      teamId,
      result.status === "pending_email"
        ? "?saved=promoted-pending-email"
        : "?saved=promoted",
    ),
  );
}`;
  source = replaceFinalFunction(
    source,
    "export async function convertAdminProspectToMemberAction",
    replacement,
    "admin prospect promotion",
  );
  write(file, source);
}

{
  const file = "src/app/captain/team/[teamid]/prospects/actions.ts";
  let source = addImport(read(file), "captain prospect promotion");
  const replacement = `export async function convertProspectToMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const access = await requireCaptain(teamid);

  if (!teamid || !prospectId) redirect("/captain");

  const result = await promoteProspectToTeamMember({
    teamId: teamid,
    prospectId,
    attemptedByUserId: access.user?.id ?? null,
    attemptedByEmail: access.user?.email ?? access.session?.user?.email ?? null,
    source: "CAPTAIN_PROSPECT_PROMOTED",
  });

  revalidatePath(\`/captain/team/\${teamid}/squad\`);
  revalidatePath(\`/captain/team/\${teamid}/prospects\`);
  revalidatePath(\`/admin/teams/\${teamid}/squad\`);
  revalidatePath(\`/admin/teams/\${teamid}/prospects\`);
  revalidatePath("/admin/player-prospects");

  if (!result.ok) {
    redirect(
      buildProspectsRedirect(
        teamid,
        \`?error=\${encodeURIComponent(result.message)}\`,
      ),
    );
  }

  redirect(
    buildProspectsRedirect(
      teamid,
      result.status === "pending_email"
        ? "?saved=promoted-pending-email"
        : "?saved=promoted",
    ),
  );
}`;
  source = replaceFinalFunction(
    source,
    "export async function convertProspectToMemberAction",
    replacement,
    "captain prospect promotion",
  );
  write(file, source);
}

for (const [file, markers] of [
  [
    "src/app/(admin)/admin/teams/[id]/prospects/actions.ts",
    ["promoteProspectToTeamMember", "ADMIN_PROSPECT_PROMOTED"],
  ],
  [
    "src/app/captain/team/[teamid]/prospects/actions.ts",
    ["promoteProspectToTeamMember", "CAPTAIN_PROSPECT_PROMOTED"],
  ],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${file} is missing promotion safety marker: ${marker}`);
    }
  }
}

console.log(
  "Captain and admin prospect promotions now preserve separate identities when a contact email is shared.",
);
