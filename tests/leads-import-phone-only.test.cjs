const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("lead importer accepts phone-only Meta leads and keeps duplicate checks optional by contact method", () => {
  const source = fs.readFileSync(
    "src/app/(admin)/admin/leads/import/actions.ts",
    "utf8",
  );
  const form = fs.readFileSync(
    "src/components/admin/leads/ImportLeadsForm.tsx",
    "utf8",
  );

  assert.match(source, /if \(!row\.email && !row\.phoneNormalized\)/);
  assert.match(
    source,
    /const emails = validRows\.flatMap\(\(row\) => \(row\.email \? \[row\.email\] : \[\]\)\)/,
  );
  assert.match(source, /const emailMatch = row\.email\s+\?/);
  assert.match(source, /email: row\.email \|\| null/);
  assert.match(source, /phone: row\.phoneNormalized \? row\.phone : null/);
  assert.match(
    form,
    /A valid email or UK mobile number is enough to import a lead/,
  );
});

test("invalid phone does not discard an otherwise usable email lead", () => {
  const source = fs.readFileSync(
    "src/app/(admin)/admin/leads/import/actions.ts",
    "utf8",
  );

  assert.match(
    source,
    /if \(row\.phone && !row\.phoneNormalized && row\.email\)/,
  );
  assert.match(source, /ignored invalid\/non-UK phone/);
});
