const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/captain-squad/page.tsx",
);

let source = fs.readFileSync(target, "utf8");

const functionMarker = "async function updateCaptainPlayerShirtNumberAction(formData: FormData)";
const usageMarker = "action={updateCaptainPlayerShirtNumberAction}";
const insertionAnchor = "async function sendCaptainPlayerDashboardLoginEmailAction(formData: FormData) {";

if (!source.includes(usageMarker)) {
  console.log("Captain shirt-number action is not used; no compatibility patch required.");
  process.exit(0);
}

if (source.includes(functionMarker)) {
  console.log("Captain shirt-number action is already present.");
  process.exit(0);
}

if (!source.includes(insertionAnchor)) {
  throw new Error("Could not restore captain shirt-number action: insertion anchor is missing.");
}

const action = `async function updateCaptainPlayerShirtNumberAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const rawShirtNumber = String(formData.get("shirtNumber") ?? "").trim();
  const shirtNumber = rawShirtNumber ? Number(rawShirtNumber) : null;

  await requireCaptain(teamid);

  if (!teamid || !membershipId) redirect("/captain");

  if (
    shirtNumber !== null &&
    (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99)
  ) {
    redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("Shirt number must be between 1 and 99.")}\`);
  }

  const membership = await prisma.teamMember.findFirst({
    where: { id: membershipId, teamId: teamid },
    select: { id: true },
  });

  if (!membership) {
    redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("Player not found.")}\`);
  }

  if (shirtNumber !== null) {
    const duplicate = await prisma.teamMember.findFirst({
      where: { teamId: teamid, shirtNumber, id: { not: membershipId } },
      select: { id: true },
    });

    if (duplicate) {
      redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(\`Shirt number \${shirtNumber} is already in use by another player in this squad.\`)}\`);
    }
  }

  await prisma.teamMember.update({
    where: { id: membershipId },
    data: { shirtNumber },
  });

  revalidatePath(\`/captain/team/\${teamid}\`);
  revalidatePath(\`/captain/team/\${teamid}/captain-squad\`);
  revalidatePath(\`/captain/team/\${teamid}/squad\`);
  revalidatePath(\`/admin/teams/\${teamid}/squad\`);

  redirect(\`/captain/team/\${teamid}/captain-squad?saved=shirt-number-updated\`);
}

`;

source = source.replace(insertionAnchor, action + insertionAnchor);
fs.writeFileSync(target, source);
console.log("Restored captain shirt-number server action after prebuild compatibility patches.");
