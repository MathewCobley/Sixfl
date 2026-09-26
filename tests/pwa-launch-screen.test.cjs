const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("installed PWA has a branded launch screen using the real SIXFL logo", () => {
  const screen = fs.readFileSync(
    "src/components/pwa/PwaLaunchScreen.tsx",
    "utf8",
  );
  const providers = fs.readFileSync("src/app/providers.tsx", "utf8");

  assert.match(screen, /src="\/logo2\.png"/);
  assert.match(screen, /6-a-side football\./);
  assert.match(screen, /Properly run\./);
  assert.match(screen, /Player Portal/);
  assert.match(screen, /Captain Portal/);
  assert.match(screen, /Referee Portal/);
  assert.match(screen, /Loading your portal/);
  assert.match(screen, /display-mode: standalone/);
  assert.match(screen, /navigator as Navigator & \{ standalone\?: boolean \}/);
  assert.match(screen, /window\.sessionStorage/);
  assert.match(screen, /prefers-reduced-motion: reduce/);
  assert.match(providers, /import PwaLaunchScreen/);
  assert.match(providers, /<PwaLaunchScreen \/>/);
});
