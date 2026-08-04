const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);
const formPath = path.join(
  root,
  "src",
  "components",
  "captain",
  "TeamKitOrderForm.tsx",
);

for (const filePath of [pagePath, formPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required badge review UI file is missing: ${path.relative(root, filePath)}`);
  }
}

let page = fs.readFileSync(pagePath, "utf8");
let form = fs.readFileSync(formPath, "utf8");

// Load the badge and the captain's existing review state.
const teamQueryStart = page.indexOf("  const team = await prisma.team.findUnique({");
const teamQueryEnd = page.indexOf("  });", teamQueryStart);
if (teamQueryStart < 0 || teamQueryEnd < 0) {
  throw new Error("The captain kit team query was not found.");
}
let teamQuery = page.slice(teamQueryStart, teamQueryEnd + 5);
if (!teamQuery.includes("kitBadgeConfirmedAt: true")) {
  const identityMarker = "      id: true,\n      name: true,";
  if (!teamQuery.includes(identityMarker)) {
    throw new Error("The captain kit team identity fields were not found.");
  }
  teamQuery = teamQuery.replace(
    identityMarker,
    [
      "      id: true,",
      "      name: true,",
      "      logoUrl: true,",
      "      kitBadgeConfirmedAt: true,",
      "      kitBadgeChangeRequestedAt: true,",
      "      kitBadgeChangeRequestNote: true,",
    ].join("\n"),
  );
  page =
    page.slice(0, teamQueryStart) +
    teamQuery +
    page.slice(teamQueryEnd + 5);
}

// Pass the badge review state into the main order form.
const orderFormStart = page.indexOf("        <TeamKitOrderForm");
const orderFormEnd = page.indexOf("        />", orderFormStart);
if (orderFormStart < 0 || orderFormEnd < 0) {
  throw new Error("The TeamKitOrderForm component was not found on the captain kit page.");
}
let orderFormBlock = page.slice(orderFormStart, orderFormEnd);
if (!orderFormBlock.includes("teamLogoUrl={team.logoUrl}")) {
  const quantityProp = "          includedKitQuantity={TEAM_KIT_QUANTITY}";
  if (!orderFormBlock.includes(quantityProp)) {
    throw new Error("The dynamic included-kit quantity prop was not found.");
  }
  orderFormBlock = orderFormBlock.replace(
    quantityProp,
    [
      quantityProp,
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

// Add the large badge confirmation panel after personalisation and before notes.
const badgeImport =
  'import TeamBadgeReviewPanel from "@/components/captain/TeamBadgeReviewPanel";';
if (!form.includes(badgeImport)) {
  const importAnchor = 'import FormListboxField from "@/components/ui/FormListboxField";';
  if (!form.includes(importAnchor)) {
    throw new Error("The team kit form import anchor was not found.");
  }
  form = form.replace(importAnchor, `${importAnchor}\n${badgeImport}`);
}

if (!form.includes("  teamLogoUrl: string | null;")) {
  const propsAnchor = "  includedKitQuantity: number;";
  if (!form.includes(propsAnchor)) {
    throw new Error("The dynamic team kit form props were not found.");
  }
  form = form.replace(
    propsAnchor,
    [
      propsAnchor,
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
  const destructureAnchor = "  includedKitQuantity,\n  initialDesignId,";
  if (!form.includes(destructureAnchor)) {
    throw new Error("The team kit form prop destructuring anchor was not found.");
  }
  form = form.replace(
    destructureAnchor,
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
  const stepTwoHeading = "Personalise all {kitQuantity} kits";
  const headingIndex = form.indexOf(stepTwoHeading);
  if (headingIndex < 0) {
    throw new Error("The kit personalisation heading was not found.");
  }
  const stepTwoEnd = form.indexOf("</section>", headingIndex);
  if (stepTwoEnd < 0) {
    throw new Error("The kit personalisation section end was not found.");
  }
  const insertionPoint = stepTwoEnd + "</section>".length;
  const panel = `

      <TeamBadgeReviewPanel
        teamId={teamId}
        teamName={teamName}
        logoUrl={teamLogoUrl}
        initialStatus={initialBadgeStatus}
        initialConfirmedAt={initialBadgeConfirmedAt}
        initialChangeRequestedAt={initialBadgeChangeRequestedAt}
        initialChangeRequestNote={initialBadgeChangeRequestNote}
      />`;
  form = form.slice(0, insertionPoint) + panel + form.slice(insertionPoint);
}

const checks = [
  page.includes("kitBadgeConfirmedAt: true"),
  page.includes("teamLogoUrl={team.logoUrl}"),
  form.includes(badgeImport),
  form.includes("teamLogoUrl: string | null;"),
  form.includes("<TeamBadgeReviewPanel"),
  form.indexOf("<TeamBadgeReviewPanel") < form.indexOf("Notes for SIXFL"),
];
if (checks.some((check) => !check)) {
  throw new Error("The team badge confirmation stage was not mounted correctly.");
}

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(formPath, form, "utf8");
console.log(
  "Team kit orders now show the large team badge as Step 3 and record whether the captain keeps it or requests a change.",
);
