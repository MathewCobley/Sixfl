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
    throw new Error(`Required badge source file is missing: ${path.relative(root, filePath)}`);
  }
}

let page = fs.readFileSync(pagePath, "utf8");
let form = fs.readFileSync(formPath, "utf8");

if (!page.includes("kitBadgeConfirmedAt: true")) {
  const teamQueryStart = page.indexOf("  const team = await prisma.team.findUnique({");
  const teamQueryEnd = page.indexOf("  });", teamQueryStart);
  if (teamQueryStart < 0 || teamQueryEnd < 0) {
    throw new Error("The captain kit team query was not found.");
  }

  const query = page.slice(teamQueryStart, teamQueryEnd + 5);
  const identityMarker = "      id: true,\n      name: true,";
  if (!query.includes(identityMarker)) {
    throw new Error("The captain kit team identity fields were not found.");
  }

  const updatedQuery = query.replace(
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
    updatedQuery +
    page.slice(teamQueryEnd + 5);
}

if (!page.includes("teamLogoUrl={team.logoUrl}")) {
  const actionProp = "          action={saveAction}\n";
  if (!page.includes(actionProp)) {
    throw new Error("The captain kit form action prop was not found.");
  }
  page = page.replace(
    actionProp,
    [
      "          action={saveAction}",
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
      "",
    ].join("\n"),
  );
}

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
  const propsAnchor = "  initialCaptainNotes: string | null;";
  if (!form.includes(propsAnchor)) {
    throw new Error("The team kit form props anchor was not found.");
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
  const destructureAnchor = "  initialCaptainNotes,\n  locked,";
  if (!form.includes(destructureAnchor)) {
    throw new Error("The team kit form destructuring anchor was not found.");
  }
  form = form.replace(
    destructureAnchor,
    [
      "  initialCaptainNotes,",
      "  teamId,",
      "  teamName,",
      "  teamLogoUrl,",
      "  initialBadgeStatus,",
      "  initialBadgeConfirmedAt,",
      "  initialBadgeChangeRequestedAt,",
      "  initialBadgeChangeRequestNote,",
      "  locked,",
    ].join("\n"),
  );
}

if (!form.includes("<TeamBadgeReviewPanel")) {
  const possibleHeadings = [
    "Personalise all {kitQuantity} kits",
    "Personalise all nine kits",
    "Personalise all seven kits",
  ];
  const headingIndex = possibleHeadings
    .map((heading) => form.indexOf(heading))
    .find((index) => index >= 0);
  if (headingIndex === undefined) {
    throw new Error("The kit personalisation heading was not found.");
  }
  const sectionEnd = form.indexOf("</section>", headingIndex);
  if (sectionEnd < 0) {
    throw new Error("The kit personalisation section end was not found.");
  }
  const insertionPoint = sectionEnd + "</section>".length;
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
];
if (checks.some((check) => !check)) {
  throw new Error("The badge confirmation source preparation did not complete.");
}

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(formPath, form, "utf8");
console.log("Prepared the team badge confirmation as the third captain kit stage.");
