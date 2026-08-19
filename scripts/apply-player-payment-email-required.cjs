const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const actionsPath = path.join(root, "src", "app", "captain", "team", "[teamid]", "player-payments", "actions.ts");
const pagePath = path.join(root, "src", "app", "captain", "team", "[teamid]", "player-payments", "PaymentPageServer.tsx");

let actions = fs.readFileSync(actionsPath, "utf8");
let page = fs.readFileSync(pagePath, "utf8");

// Require the whole current squad to have email addresses before a captain can
// create or update Squad payments. The page wrapper enforces the same rule in
// the UI; this server-side check also protects stale/open forms.
if (!actions.includes("squadMembersForEmailReadiness")) {
  const readinessAnchor = `export async function createCaptainSquadPaymentCollectionAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const defaultAmountPence = parseAmountPence(getString(formData, "amount"));
  const players = getSelectedPlayers(formData);

  if (!teamId || !fixtureId) {
    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_fixture"));
  }

  await requireCaptain(teamId);`;

  if (!actions.includes(readinessAnchor)) {
    throw new Error("Captain squad-payment action readiness anchor not found.");
  }

  actions = actions.replace(
    readinessAnchor,
    `${readinessAnchor}

  const squadMembersForEmailReadiness = await prisma.teamMember.findMany({
    where: { teamId },
    select: { id: true, user: { select: { email: true } } },
  });
  const hasMissingSquadEmail = squadMembersForEmailReadiness.some(
    (member) => !member.user.email?.trim(),
  );

  if (hasMissingSquadEmail) {
    redirect(
      getPlayerPaymentsPath(
        teamId,
        fixtureId,
        "&error=squad_emails_incomplete",
      ),
    );
  }`,
  );
}

// Native source now owns this guard. Keep this compatibility patch safe for older
// branches, but do not duplicate the native server-side check during prebuild.
if (!actions.includes("selectedMemberIdsForEmailCheck")) {
  const actionGuardAnchor = '  if (players.length === 0) {\n    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=no_players"));\n  }';
  if (!actions.includes(actionGuardAnchor)) throw new Error("Player payment no-players guard not found.");
  actions = actions.replace(actionGuardAnchor, `${actionGuardAnchor}\n\n  const selectedMemberIdsForEmailCheck = players.filter((player) => player.type === "member").map((player) => player.id);\n  const selectedProspectIdsForEmailCheck = players.filter((player) => player.type === "prospect").map((player) => player.id);\n  const [membersForEmailCheck, prospectsForEmailCheck] = await Promise.all([\n    prisma.teamMember.findMany({\n      where: { id: { in: selectedMemberIdsForEmailCheck }, teamId },\n      select: { id: true, user: { select: { email: true } } },\n    }),\n    prisma.teamPlayerProspect.findMany({\n      where: { id: { in: selectedProspectIdsForEmailCheck }, teamId },\n      select: { id: true, email: true },\n    }),\n  ]);\n  const memberEmailById = new Map(membersForEmailCheck.map((member) => [member.id, member.user.email?.trim() || null]));\n  const prospectEmailById = new Map(prospectsForEmailCheck.map((prospect) => [prospect.id, prospect.email?.trim() || null]));\n  for (const player of players) {\n    const enteredAmountPence = getPlayerAmountPence({ formData, type: player.type, id: player.id, defaultAmountPence });\n    if (enteredAmountPence === null) continue;\n    const method = getCollectionMethod({ formData, type: player.type, id: player.id, amountPence: enteredAmountPence });\n    const email = player.type === "member" ? memberEmailById.get(player.id) : prospectEmailById.get(player.id);\n    if (method === "link" && !email) {\n      redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=missing_player_email"));\n    }\n  }`);
}

if (!page.includes('if (error === "missing_player_email")')) {
  const errorAnchor = '  if (error === "no_players") return "Select at least one player.";';
  if (!page.includes(errorAnchor)) throw new Error("Player payment error-message anchor not found.");
  page = page.replace(errorAnchor, `${errorAnchor}\n  if (error === "missing_player_email") return "Payment links can only be created for players with a saved email address. Add the missing email or choose a non-link collection method.";`);
}

if (!page.includes("emailRequired:")) {
  page = page.replace(
    '      contact: member.user.email,\n      checked: selectedMemberIds.has(member.id),',
    '      contact: member.user.email,\n      emailRequired: !member.user.email?.trim(),\n      checked: selectedMemberIds.has(member.id),',
  );
  page = page.replace(
    '      contact: playerContact({\n        prospectEmail: prospect.email,\n        prospectPhone: prospect.phone,\n      }),\n      checked: selectedProspectIds.has(prospect.id),',
    '      contact: playerContact({\n        prospectEmail: prospect.email,\n        prospectPhone: prospect.phone,\n      }),\n      emailRequired: !prospect.email?.trim(),\n      checked: selectedProspectIds.has(prospect.id),',
  );
}

// Disable the player checkbox for SMS-only/no-email players and make the reason explicit.
if (!page.includes('disabled={player.emailRequired')) {
  const checkboxAnchor = 'name="player"';
  const checkboxIndex = page.indexOf(checkboxAnchor);
  if (checkboxIndex < 0) throw new Error("Player payment checkbox not found.");
  const inputStart = page.lastIndexOf("<input", checkboxIndex);
  const inputEnd = page.indexOf("/>", checkboxIndex);
  if (inputStart < 0 || inputEnd < 0) throw new Error("Player payment checkbox element not found.");
  let input = page.slice(inputStart, inputEnd + 2);
  if (!input.includes("disabled={player.emailRequired")) {
    input = input.replace('name="player"', 'name="player"\n                              disabled={player.emailRequired && !player.fee}');
    page = page.slice(0, inputStart) + input + page.slice(inputEnd + 2);
  }
}

if (!page.includes('Email required')) {
  const contactRender = '{player.contact || "No contact saved"}';
  if (page.includes(contactRender)) {
    page = page.replace(contactRender, '{player.emailRequired ? "Email required — add an email before sending a payment link" : player.contact || "No contact saved"}');
  } else {
    const simpleContactRender = '{player.contact}';
    if (!page.includes(simpleContactRender)) throw new Error("Player contact display not found.");
    page = page.replace(simpleContactRender, '{player.emailRequired ? "Email required — add an email before sending a payment link" : player.contact}');
  }
}

fs.writeFileSync(actionsPath, actions, "utf8");
fs.writeFileSync(pagePath, page, "utf8");
console.log("Player payment email requirement is present and the legacy compatibility patch is idempotent.");
