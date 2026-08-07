const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function patchFile(relativePath, transform, label) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[fixture-week-scroll] Missing ${label}: ${relativePath}`);
  }
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) {
    const alreadyPatched =
      before.includes("fixture-week-unassigned") ||
      before.includes('startsWith("/admin/fixtures#")');
    if (alreadyPatched) {
      console.log(`[fixture-week-scroll] ${label} already patched.`);
      return;
    }
    throw new Error(`[fixture-week-scroll] Could not patch ${label}: source anchor changed.`);
  }
  fs.writeFileSync(filePath, after, "utf8");
  console.log(`[fixture-week-scroll] Patched ${label}.`);
}

patchFile(
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
  (source) => {
    if (!source.includes("function getWeekAnchor(")) {
      source = source.replace(
        `function getWeekLabel(round: number | null) {\n  return round === null ? \"Unassigned week\" : \`Week \${round}\`;\n}\n`,
        `function getWeekLabel(round: number | null) {\n  return round === null ? \"Unassigned week\" : \`Week \${round}\`;\n}\n\nfunction getWeekAnchor(round: number | null) {\n  return round === null ? \"fixture-week-unassigned\" : \`fixture-week-\${round}\`;\n}\n`,
      );
    }

    source = source.replace(
      `  status: StatusFilter;\n}) {\n  const returnTo = buildGridHref(input.leagueId, input.divisionId || null, input.visibility, input.status);\n  const params = new URLSearchParams({ returnTo });`,
      `  status: StatusFilter;\n  round: number | null;\n}) {\n  const returnTo = buildGridHref(input.leagueId, input.divisionId || null, input.visibility, input.status);\n  const returnToWeek = \`${"${returnTo}"}#${"${getWeekAnchor(input.round)}"}\`;\n  const params = new URLSearchParams({ returnTo: returnToWeek });`,
    );

    source = source.replace(
      `<div key={roundLabel} className="space-y-3">`,
      `<div\n                      key={roundLabel}\n                      id={getWeekAnchor(roundFixtures[0]?.round ?? null)}\n                      className="scroll-mt-6 space-y-3"\n                    >`,
    );

    source = source.replace(
      `status: selectedStatus })}`,
      `status: selectedStatus, round: fixture.round })}`,
    );

    return source;
  },
  "fixture matchup grid",
);

patchFile(
  "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts",
  (source) => {
    source = source.replace(
      `function safeFixturesReturnTo(value: FormDataEntryValue | null) {\n  const parsed = String(value ?? \"\").trim();\n  return parsed === \"/admin/fixtures\" || parsed.startsWith(\"/admin/fixtures?\")\n    ? parsed\n    : \"/admin/fixtures\";\n}\n`,
      `function safeFixturesReturnTo(value: FormDataEntryValue | null) {\n  const parsed = String(value ?? \"\").trim();\n  return (\n    parsed === \"/admin/fixtures\" ||\n    parsed.startsWith(\"/admin/fixtures?\") ||\n    parsed.startsWith(\"/admin/fixtures#\")\n  )\n    ? parsed\n    : \"/admin/fixtures\";\n}\n\nfunction stripHash(value: string) {\n  return value.split(\"#\", 1)[0] || \"/admin/fixtures\";\n}\n\nfunction withWeekAnchor(value: string, round: number | null) {\n  const base = stripHash(value);\n  const anchor = round === null ? \"fixture-week-unassigned\" : \`fixture-week-\${round}\`;\n  return \`${"${base}"}#${"${anchor}"}\`;\n}\n`,
    );

    source = source.replace(
      `  const requestId = randomUUID().slice(0, 8);\n\n  try {`,
      `  const requestId = randomUUID().slice(0, 8);\n  let successReturnTo = returnTo;\n\n  try {`,
    );

    source = source.replace(
      `    const round = parseOptionalInt(formData.get(\"round\"), \"Week\");\n`,
      `    const round = parseOptionalInt(formData.get(\"round\"), \"Week\");\n    successReturnTo = withWeekAnchor(returnTo, round);\n`,
    );

    source = source.replace(
      `    revalidatePath(returnTo);`,
      `    revalidatePath(stripHash(successReturnTo));`,
    );

    source = source.replace(
      `  redirect(returnTo);\n}`,
      `  redirect(successReturnTo);\n}`,
    );

    return source;
  },
  "fixture edit action",
);

patchFile(
  "src/app/(admin)/admin/fixtures/[id]/edit/page.tsx",
  (source) => {
    source = source.replace(
      `function safeReturnTo(value: string) {\n  return value === \"/admin/fixtures\" || value.startsWith(\"/admin/fixtures?\")\n    ? value\n    : \"/admin/fixtures\";\n}\n`,
      `function safeReturnTo(value: string) {\n  return (\n    value === \"/admin/fixtures\" ||\n    value.startsWith(\"/admin/fixtures?\") ||\n    value.startsWith(\"/admin/fixtures#\")\n  )\n    ? value\n    : \"/admin/fixtures\";\n}\n`,
    );
    return source;
  },
  "fixture edit page",
);
