const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const formPath = path.join(
  root,
  "src",
  "components",
  "captain",
  "TeamKitOrderForm.tsx",
);
const captainPagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);

for (const filePath of [schemaPath, formPath, captainPagePath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required badge-review file is missing: ${path.relative(root, filePath)}`);
  }
}

// Store the captain's badge review on the Team record. This is applied before
// Prisma Client generation, so the API and captain page use the generated fields.
let schema = fs.readFileSync(schemaPath, "utf8");
const teamModelStart = schema.indexOf("model Team {");
const nextModelStart = schema.indexOf("\nmodel ", teamModelStart + 1);
if (teamModelStart < 0 || nextModelStart < 0) {
  throw new Error("Team model could not be located in Prisma schema.");
}
let teamModel = schema.slice(teamModelStart, nextModelStart);

if (!teamModel.includes("kitBadgeConfirmedAt")) {
  const logoPattern = /  logoUrl\s+String\?/;
  const match = teamModel.match(logoPattern);
  if (!match) throw new Error("Team logoUrl field could not be located.");
  teamModel = teamModel.replace(
    match[0],
    [
      match[0],
      "",
      "  kitBadgeConfirmedAt       DateTime?",
      "  kitBadgeChangeRequestedAt DateTime?",
      "  kitBadgeChangeRequestNote String?",
    ].join("\n"),
  );
}

if (!teamModel.includes("@@index([kitBadgeChangeRequestedAt])")) {
  const closingBrace = teamModel.lastIndexOf("}");
  if (closingBrace < 0) throw new Error("Team model closing brace was not found.");
  teamModel =
    teamModel.slice(0, closingBrace) +
    "  @@index([kitBadgeChangeRequestedAt])\n" +
    teamModel.slice(closingBrace);
}

schema = schema.slice(0, teamModelStart) + teamModel + schema.slice(nextModelStart);
fs.writeFileSync(schemaPath, schema, "utf8");

// Load the badge and current review state on the captain kit page.
let page = fs.readFileSync(captainPagePath, "utf8");
const teamSelectStart = page.indexOf("  const team = await prisma.team.findUnique({");
const teamSelectEnd = page.indexOf("  });", teamSelectStart);
if (teamSelectStart < 0 || teamSelectEnd < 0) {
  throw new Error("Captain kit team query could not be located.");
}
let teamQuery = page.slice(teamSelectStart, teamSelectEnd + 5);
if (!teamQuery.includes("kitBadgeConfirmedAt: true")) {
  const selectPattern = /      id: true,\n      name: true,/;
  if (!selectPattern.test(teamQuery)) {
    throw new Error("Captain kit team select marker was not found.");
  }
  teamQuery = teamQuery.replace(
    selectPattern,
    [
      "      id: true,",
      "      name: true,",
      "      logoUrl: true,",
      "      kitBadgeConfirmedAt: true,",
      "      kitBadgeChangeRequestedAt: true,",
      "      kitBadgeChangeRequestNote: true,",
    ].join("\n"),
  );
  page = page.slice(0, teamSelectStart) + teamQuery + page.slice(teamSelectEnd + 5);
}

const orderFormStart = page.indexOf("        <TeamKitOrderForm");
const orderFormEnd = page.indexOf("        />", orderFormStart);
if (orderFormStart < 0 || orderFormEnd < 0) {
  throw new Error("TeamKitOrderForm usage could not be located.");
}
let orderFormBlock = page.slice(orderFormStart, orderFormEnd);
if (!orderFormBlock.includes("teamLogoUrl={team.logoUrl}")) {
  const propPattern = /          includedKitQuantity=\{TEAM_KIT_QUANTITY\}/;
  if (!propPattern.test(orderFormBlock)) {
    throw new Error("Dynamic included-kit form prop was not found.");
  }
  orderFormBlock = orderFormBlock.replace(
    propPattern,
    [
      "          includedKitQuantity={TEAM_KIT_QUANTITY}",
      "          teamId={team.id}",
      "          teamName={team.name}",
      "          teamLogoUrl={team.logoUrl}",
      "          initialBadgeStatus={",
      "            team.kitBadgeChangeRequestedAt",
      '              ? "CHANGE_REQUESTED"',
      "              : team.kitBadgeConfirmedAt",
      '                ? "CONFIRMED"',
      '                : "PENDING"',
      "          }",
      "          initialBadgeConfirmedAt={",
      "            team.kitBadgeConfirmedAt?.toISOString() ?? null",
      "          }",
      "          initialBadgeChangeRequestedAt={",
      "            team.kitBadgeChangeRequestedAt?.toISOString() ?? null",
      "          }",
      "          initialBadgeChangeRequestNote={team.kitBadgeChangeRequestNote}",
    ].join("\n"),
  );
  page = page.slice(0, orderFormStart) + orderFormBlock + page.slice(orderFormEnd);
}
fs.writeFileSync(captainPagePath, page, "utf8");

// Mount Step 3 immediately after the dynamic personalisation section.
let form = fs.readFileSync(formPath, "utf8");
const badgeImport =
  'import TeamBadgeReviewPanel from "@/components/captain/TeamBadgeReviewPanel";';
if (!form.includes(badgeImport)) {
  const importAnchor = 'import FormListboxField from "@/components/ui/FormListboxField";';
  if (!form.includes(importAnchor)) {
    throw new Error("Team kit form UI import anchor was not found.");
  }
  form = form.replace(importAnchor, `${importAnchor}\n${badgeImport}`);
}

if (!form.includes("  teamLogoUrl: string | null;")) {
  const propsMarker = "  includedKitQuantity: number;";
  if (!form.includes(propsMarker)) {
    throw new Error("Dynamic TeamKitOrderForm props were not found.");
  }
  form = form.replace(
    propsMarker,
    [
      propsMarker,
      "  teamId: string;",
      "  teamName: string;",
      "  teamLogoUrl: string | null;",
      '  initialBadgeStatus: "PENDING" | "CONFIRMED" | "CHANGE_REQUESTED";',
      "  initialBadgeConfirmedAt: string | null;",
      "  initialBadgeChangeRequestedAt: string | null;",
      "  initialBadgeChangeRequestNote: string | null;",
    ].join("\n"),
  );
}

if (!form.includes("  teamLogoUrl,\n")) {
  const destructurePattern = /  includedKitQuantity,\n  initialDesignId,/;
  if (!destructurePattern.test(form)) {
    throw new Error("TeamKitOrderForm prop destructuring marker was not found.");
  }
  form = form.replace(
    destructurePattern,
    [
      "  includedKitQuantity,",
      "  teamId,",
      "  teamName,",
      "  teamLogoUrl,",
      "  initialBadgeStatus,",
      "  initialBadgeConfirmedAt,",
      "  initialBadgeChangeRequestedAt,",
      "  initialBadgeChangeRequestNote,",
      "  initialDesignId,",
    ].join("\n"),
  );
}

if (!form.includes("<TeamBadgeReviewPanel")) {
  const stepTwoMarker = "Personalise all {kitQuantity} kits";
  const stepTwoIndex = form.indexOf(stepTwoMarker);
  if (stepTwoIndex < 0) {
    throw new Error("Team kit personalisation step could not be located.");
  }
  const stepTwoEnd = form.indexOf("</section>", stepTwoIndex);
  if (stepTwoEnd < 0) {
    throw new Error("Team kit personalisation section end could not be located.");
  }
  const insertionPoint = stepTwoEnd + "</section>".length;
  const badgePanel = `

      <TeamBadgeReviewPanel
        teamId={teamId}
        teamName={teamName}
        logoUrl={teamLogoUrl}
        initialStatus={initialBadgeStatus}
        initialConfirmedAt={initialBadgeConfirmedAt}
        initialChangeRequestedAt={initialBadgeChangeRequestedAt}
        initialChangeRequestNote={initialBadgeChangeRequestNote}
      />`;
  form = form.slice(0, insertionPoint) + badgePanel + form.slice(insertionPoint);
}
fs.writeFileSync(formPath, form, "utf8");

const finalSchema = fs.readFileSync(schemaPath, "utf8");
const finalPage = fs.readFileSync(captainPagePath, "utf8");
const finalForm = fs.readFileSync(formPath, "utf8");
if (
  !finalSchema.includes("kitBadgeConfirmedAt") ||
  !finalPage.includes("teamLogoUrl={team.logoUrl}") ||
  !finalForm.includes("<TeamBadgeReviewPanel")
) {
  throw new Error("Team badge review stage was not applied correctly.");
}

console.log(
  "Team kit orders now include a build-safe Step 3 badge review with saved confirmations and change requests.",
);
