const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const updaterPath = "src/components/PwaServiceWorker.tsx";
const versionRoutePath = "src/app/api/pwa/version/route.ts";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("installed PWA uses deployment-version-aware silent updates", () => {
  const source = read(updaterPath);

  assert.match(source, /if \(!isInstalledApp\(\)\) return;/);
  assert.match(source, /sixfl:pwa-version/);
  assert.match(source, /sixfl:pwa-pending-version/);
  assert.match(source, /fetchDeploymentVersion/);
  assert.match(source, /\/api\/pwa\/version/);
  assert.match(source, /deploymentVersion !== storedVersion/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /router\.refresh\(\)/);
});

test("automatic full reload is restricted to safe portal homes", () => {
  const source = read(updaterPath);

  assert.match(source, /pathname === "\/dashboard"/);
  assert.match(source, /pathname === "\/referee"/);
  assert.match(source, /captain\\\/team/);
  assert.match(source, /player\\\/team/);
  assert.match(source, /hasActiveEditor\(\)/);
});

test("deployment version endpoint is explicitly uncached", () => {
  const source = read(versionRoutePath);

  assert.match(source, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(source, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(source, /Cache-Control/);
  assert.match(source, /no-store/);
  assert.match(source, /force-dynamic/);
});
