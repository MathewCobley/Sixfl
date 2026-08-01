const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/captain/team/[teamid]/captain-squad/page.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

source = source.replace('import { randomUUID } from "crypto";\n', "");

const helperImport =
  'import { addPlayerToTeamWithoutDuplicates } from "@/lib/players/add-player-without-duplicates";';
if (!source.includes(helperImport)) {
  const importAnchor =
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";';
  if (!source.includes(importAnchor)) {
    throw new Error("Captain squad duplicate-guard import anchor was not found.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n${helperImport}`);
}

const actionStart = source.indexOf("async function addCaptainPlayerAction(formData: FormData) {");
const actionEnd = source.indexOf(
  "\nasync function sendCaptainPlayerDashboardLoginEmailAction(formData: FormData) {",
  actionStart,
);

if (actionStart < 0 || actionEnd < 0) {
  throw new Error("Captain add-player action boundaries were not found.");
}

const replacementAction = `async function addCaptainPlayerAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const usesWhatsapp = formData.get("usesWhatsapp") === "on";

  const access = await requireCaptain(teamid);

  if (!teamid) redirect("/captain");
  if (!displayName) {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        "Enter the player name.",
      )}\`,
    );
  }
  if (!email && !phone) {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        "Add an email address or mobile number. Name-only player records are not allowed because they create duplicates.",
      )}\`,
    );
  }
  if (email && !email.includes("@")) {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        "Enter a valid email address or leave it blank and add a mobile number.",
      )}\`,
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, teamMode: true },
  });

  if (!team) {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        "Team not found.",
      )}\`,
    );
  }

  if (team.teamMode === "MANAGED") {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        "SIXFL manages player additions for managed teams.",
      )}\`,
    );
  }

  const result = await addPlayerToTeamWithoutDuplicates({
    teamId: teamid,
    displayName,
    email,
    phone,
    usesWhatsapp,
    attemptedByUserId: access.user?.id ?? null,
    attemptedByEmail: access.user?.email ?? null,
  });

  if (!result.ok) {
    redirect(
      \`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(
        result.message,
      )}\`,
    );
  }

  revalidatePath(\`/captain/team/\${teamid}\`);
  revalidatePath(\`/captain/team/\${teamid}/captain-squad\`);
  revalidatePath(\`/captain/team/\${teamid}/squad\`);
  revalidatePath(\`/captain/team/\${teamid}/player-payments\`);
  redirect(\`/captain/team/\${teamid}/captain-squad?saved=player-added\`);
}
`;

source = source.slice(0, actionStart) + replacementAction + source.slice(actionEnd);

source = source.replace(
  "Add a basic player record now so they can be picked for goals, assists and Player of the Match. Add an email if you want to send a dashboard login link.",
  "Add the player once using an email address or mobile number. SIXFL checks the full system first and reuses an existing player account where possible. Name-only records are blocked.",
);
source = source.replace(
  "<span>Email optional</span>",
  "<span>Email address · email or phone required</span>",
);
source = source.replace(
  "<span>Phone optional</span>",
  "<span>Mobile number · email or phone required</span>",
);

fs.writeFileSync(absolutePath, source, "utf8");

if (!source.includes("addPlayerToTeamWithoutDuplicates")) {
  throw new Error("The central duplicate-safe player service was not connected.");
}
if (source.includes("await prisma.user.create({\n      data: { name: displayName, email }")) {
  throw new Error("The old unrestricted captain player creation path is still present.");
}
if (!source.includes("Name-only records are blocked")) {
  throw new Error("The captain duplicate-prevention guidance was not added.");
}

require("./apply-manager-cross-team-player-guard.cjs");
require("./apply-squad-member-creation-details.cjs");

console.log(
  "Managers cannot create duplicate player records: contact identity is required and checked system-wide and across every team they control.",
);
