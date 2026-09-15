const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("Cup test sender is deliberately non-recording", () => {
  const source = read("src/lib/cups/test-email.ts");

  assert.match(source, /queueCupTestEmail/);
  assert.match(source, /\/cup-interest\/test-response/);
  assert.match(source, /cupTestSend: true/);
  assert.match(source, /noCupResponseRecorded: true/);
  assert.doesNotMatch(source, /previewCupInvitations/);
  assert.doesNotMatch(source, /sendCupInvitations/);
  assert.doesNotMatch(source, /cupAudit\s*\(/);
  assert.doesNotMatch(source, /prisma\.\$executeRaw/);
});

test("Cup test links land on an inert public page", () => {
  const source = read("src/app/cup-interest/test-response/page.tsx");

  assert.match(source, /No Cup response has been recorded/);
  assert.match(source, /deliberately non-recording/);
  assert.doesNotMatch(source, /"use server"/);
  assert.doesNotMatch(source, /prisma/);
  assert.doesNotMatch(source, /submitCup/);
});

test("Team Messages exposes test mode without replacing the real Cup route", () => {
  const prep = read("scripts/apply-cup-test-email.cjs");
  const packageJson = read("package.json");

  assert.match(prep, /require\("\.\/apply-team-message-template-scope\.cjs"\)/);
  assert.match(prep, /Send test Cup email/);
  assert.match(prep, /name=\"cupSendMode\"/);
  assert.match(prep, /cupSendMode === \"test\"/);
  assert.match(prep, /queueCupTestEmail/);
  assert.match(prep, /Normal Queue email continues through previewCupInvitations\/sendCupInvitations/);
  assert.match(packageJson, /node scripts\/apply-cup-test-email\.cjs/);
});
