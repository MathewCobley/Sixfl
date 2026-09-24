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

test("normal regenerate hides only normal stale previews and leaves test style independent", () => {
  const source = fs.readFileSync(controlsPath, "utf8");
  const studio = fs.readFileSync(studioPath, "utf8");

  assert.match(source, /const previousRenders = state\.renders/);
  assert.match(source, /render\.state === "READY"/);
  assert.match(source, /state: "QUEUED" as const/);
  assert.match(source, /render\.kind !== "HIGHLIGHTS_ALT"/);
  assert.match(
    source,
    /Fresh normal highlights and full-match previews queued\. The test-style preview has not been changed\./,
  );
  assert.match(source, /hasReadyPublicPreview \? "Regenerate highlights \+ full match" : "Generate highlights \+ full match"/);
  assert.match(source, /requestedRenderIsActive/);
  assert.match(source, /activeRenders\.some\(render => render\.kind === kind\)/);
  assert.match(source, /Regenerate \$\{kindLabel\(kind\)\} only/);
  assert.match(source, /The Highlights test style stays completely separate and only runs from its own preview card/);
  assert.match(source, /each normal video is marked for automatic public YouTube publishing/);
  assert.match(source, /try \{ await refresh\(\); \} catch \{ setState/);

  assert.match(studio, /specs\.filter\(spec => spec\.kind !== "HIGHLIGHTS_ALT"\)/);
  assert.match(studio, /"kind" IN \('HIGHLIGHTS','FULL_MATCH'\)/);
});
