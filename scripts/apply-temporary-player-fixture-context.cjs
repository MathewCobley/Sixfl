const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const file = "src/components/captain/TemporaryPlayerPassLauncher.tsx";
const fullPath = path.join(root, file);
let source = fs.readFileSync(fullPath, "utf8");

if (!source.includes("const captainFixtureContext = Boolean(captainMatch && fixtureId);")) {
  source = source.replace(
    '  const fixtureId = searchParams.get("fixtureId") ?? "";\n',
    '  const fixtureId = searchParams.get("fixtureId") ?? "";\n  const captainFixtureContext = Boolean(captainMatch && fixtureId);\n',
  );
}

source = source
  .replace(
    '  if (!mounted || (!captainMatch && !isPlayerArea)) return null;',
    '  if (!mounted || (!captainFixtureContext && !isPlayerArea)) return null;',
  )
  .replaceAll('          captainMatch\n            ?', '          captainFixtureContext\n            ?')
  .replaceAll('{captainMatch ? "+ Add temporary player" : "Play for another team"}', '{captainFixtureContext ? "+ Add temporary player" : "Play for another team"}')
  .replaceAll('{captainMatch ? "Add a temporary player" : "Share a temporary-player pass"}', '{captainFixtureContext ? "Add a temporary player" : "Share a temporary-player pass"}')
  .replaceAll('{captainMatch ? "Add a temporary player" : "Play for another team"}', '{captainFixtureContext ? "Add a temporary player" : "Play for another team"}')
  .replaceAll('{captainMatch\n                    ?', '{captainFixtureContext\n                    ?')
  .replaceAll('{captainMatch ? (', '{captainFixtureContext ? (');

if (!source.includes('if (!mounted || (!captainFixtureContext && !isPlayerArea)) return null;')) {
  throw new Error("Captain temporary-player launcher was not restricted to a selected fixture.");
}

fs.writeFileSync(fullPath, source, "utf8");
console.log("Temporary-player captain controls now appear only when a fixture is selected.");
