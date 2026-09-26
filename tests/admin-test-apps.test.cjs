const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/app/(admin)/admin/test-apps/page.tsx", "utf8");
const adminHome = fs.readFileSync("src/components/admin/pwa/AdminPwaHome.tsx", "utf8");
const more = fs.readFileSync("src/app/(admin)/admin/more/page.tsx", "utf8");
const diagnostics = fs.readFileSync("src/components/admin/PwaDiagnosticsPanel.tsx", "utf8");
const diagnosticsPage = fs.readFileSync("src/app/(admin)/admin/pwa/page.tsx", "utf8");

test("admin Test apps uses the three fixed preview identities", () => {
  assert.match(page, /requireAdmin\(\)/);
  assert.match(page, /Kebab · Hakan/);
  assert.match(page, /Finley McIntosh/);
  assert.match(page, /hasNamePart\(referee\.name, "stefan"\)/);
  assert.match(page, /\/admin\/teams\/\$\{kebabTeam\.id\}\/captain-preview/);
  assert.match(page, /previewMembershipId=\$\{encodeURIComponent\(finley\.member\.id\)\}/);
  assert.match(page, /\/admin\/referees\/\$\{stefan\.id\}\/referee-preview/);
});

test("admin app exposes Test apps without a general viewer picker", () => {
  assert.equal((adminHome.match(/href="\/admin\/test-apps"/g) || []).length, 2);
  assert.match(more, /\{ label: "Test apps", href: "\/admin\/test-apps" \}/);
  assert.doesNotMatch(diagnostics, /PwaViewerPicker|viewerData/);
  assert.doesNotMatch(diagnosticsPage, /PwaViewerPicker|viewerData|prisma\.team\.findMany/);
  assert.match(diagnostics, /Open Test apps/);
});
