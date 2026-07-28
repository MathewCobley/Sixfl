const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected confirmation chase source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

replaceOnce(
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED" && status !== "ISSUE_RAISED";\n}',
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED";\n}',
);

replaceOnce(
  "src/lib/fixtures/confirmation-reminders.ts",
  '  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
  '  if (\n    input.mode !== "manual" &&\n    existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED\n  ) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
);

console.log("Applied manual fixture confirmation chase support for issue-raised teams.");
