import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Read-only protection for the owning source files. Snapshots go to a caller-
// supplied CI temporary path, never into application source or the database.
const files = [
  "src/components/admin/AdminSidebar.tsx",
  "src/lib/current-leagues.ts",
  "src/app/(admin)/admin/leagues/page.tsx",
  "src/app/(admin)/admin/cups/actions.ts",
  "src/app/(admin)/admin/cups/page.tsx",
  "src/app/(admin)/admin/cups/[id]/actions.ts",
  "src/app/(admin)/admin/cups/[id]/page.tsx",
  "src/app/(admin)/admin/fixtures/generate/division-actions.ts",
  "src/app/(admin)/admin/fixtures/generate/page.tsx",
  "src/app/api/admin/fixtures/generate-next-week/route.ts",
  "src/app/api/admin/fixtures/matchup-grid/route.ts",
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
];
const retired = [
  "apply-cup-admin-navigation.cjs",
  "apply-venue-neutral-fixtures-current.cjs",
  "apply-venue-neutral-next-week-compat.cjs",
  "apply-fixture-matchup-grid-screen-fit.cjs",
];
const read = (file) => fs.readFileSync(file, "utf8");
const digest = (text) => createHash("sha256").update(text).digest("hex");
for (const name of retired) {
  assert.equal(fs.existsSync(path.join("scripts", name)), false, `${name} must remain deleted`);
}
for (const file of ["package.json", ...fs.readdirSync("scripts").filter((name) => /\.(cjs|mjs)$/.test(name)).map((name) => `scripts/${name}`)]) {
  if (file === "scripts/check-native-cup-fixture-source.mjs") continue;
  for (const name of retired) {
    assert.equal(read(file).includes(name), false, `${file} must not invoke retired source patch ${name}`);
  }
}
const hashes = {};
for (const file of files) {
  const source = read(file);
  assert.doesNotMatch(source, /\bMutationObserver\b|\bdocument\.(?:querySelector(?:All)?|getElementById|createElement|createTreeWalker)\b|\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|\b\w*Bridge\w*\b/, `${file} must render from React/server state, not a DOM bridge`);
  hashes[file] = digest(source);
}
const competitionModel = read("prisma/schema.prisma").match(/model LeagueCompetition \{[\s\S]*?\n\}/)?.[0];
assert.ok(competitionModel, "Native LeagueCompetition model is required");
assert.match(competitionModel, /competitionType\s+String\s+@default\("LEAGUE"\)/);
hashes["prisma/schema.prisma#LeagueCompetition"] = digest(competitionModel);
const [mode, snapshot] = process.argv.slice(2);
if (mode) {
  assert.ok(snapshot && (mode === "--snapshot" || mode === "--verify"), "Use --snapshot <temporary-file> or --verify <temporary-file>");
  const target = path.resolve(snapshot);
  assert.ok(!target.startsWith(path.resolve("src") + path.sep) && !target.startsWith(path.resolve("prisma") + path.sep), "Snapshot cannot overwrite application source");
  if (mode === "--snapshot") fs.writeFileSync(target, JSON.stringify(hashes, null, 2) + "\n");
  else assert.deepEqual(hashes, JSON.parse(read(target)), "Production preparation must not change native cup/fixture source");
}
console.log("Native cup and fixture source verified: no retired patch scripts, DOM bridges or build-time source drift.");
