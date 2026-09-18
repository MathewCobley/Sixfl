const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const studioPath = "src/lib/sixfl-tv/studio.ts";
const controlsPath = "src/components/admin/sixfl-tv/StudioControls.tsx";

test("explicit regenerate never reuses a completed READY render", () => {
  const source = fs.readFileSync(studioPath, "utf8");

  assert.match(
    source,
    /An explicit Generate \/ Regenerate request always creates a fresh job/,
  );
  assert.match(
    source,
    /"state" IN \('QUEUED','PROCESSING'\) FOR UPDATE/,
    "active jobs must still be reused/guarded to prevent duplicate concurrent renders",
  );
  assert.match(source, /INSERT INTO "SixflTvRenderJob"/);
  assert.doesNotMatch(
    source,
    /"sourceFingerprint"=\$\{fingerprint\} AND "state"='READY'/,
    "a finished render must not satisfy a new regenerate request",
  );
});

test("regenerate hides stale video immediately and labels the fresh state clearly", () => {
  const source = fs.readFileSync(controlsPath, "utf8");

  assert.match(source, /const previousRenders = state\.renders/);
  assert.match(source, /render\.state === "READY"/);
  assert.match(source, /state: "QUEUED" as const/);
  assert.match(
    source,
    /Fresh preview jobs queued\. Old previews stay hidden until the new versions are ready\./,
  );
  assert.match(source, /hasReadyPreview \? "Regenerate previews" : "Generate previews"/);
  assert.match(source, /try \{ await refresh\(\); \} catch \{ setState/);
});
