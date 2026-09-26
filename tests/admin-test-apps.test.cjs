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

test("fixed Test apps remains a direct launcher, not a general viewer picker", () => {
  assert.equal((adminHome.match(/href="\/admin\/test-apps"/g) || []).length, 2);
  assert.match(more, /\{ label: "Test apps", href: "\/admin\/test-apps" \}/);
  assert.doesNotMatch(page, /PwaViewerPicker|viewerData|<iframe/);
  assert.match(page, /No picker needed/);
});

test("PC diagnostics retains its separate authenticated viewer and phone-preview wiring", () => {
  assert.match(diagnosticsPage, /await requireAdmin\(\)/);
  assert.ok(diagnosticsPage.indexOf("await requireAdmin()") < diagnosticsPage.indexOf("prisma.team.findMany"));
  assert.match(diagnosticsPage, /<PwaDiagnosticsPanel viewerData=\{viewerData\}/);
  assert.match(diagnosticsPage, /href="\/admin\/test-apps"/);
  assert.match(diagnosticsPage, /Open fixed Test apps/);
  assert.match(diagnostics, /<PwaViewerPicker data=\{viewerData\} onPreview=\{loadPreviewPath\}/);
  assert.match(diagnostics, /<iframe/);
  assert.ok(diagnostics.indexOf("<PwaViewerPicker") < diagnostics.indexOf("PWA diagnostics"), "chooser must remain above diagnostics");
});
