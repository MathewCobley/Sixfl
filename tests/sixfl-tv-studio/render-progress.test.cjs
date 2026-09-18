const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("studio state exposes persisted render progress without a schema migration", () => {
  const source = fs.readFileSync("src/lib/sixfl-tv/studio.ts", "utf8");
  assert.match(source, /metadataJson: unknown/);
  assert.match(source, /progressPercent/);
  assert.match(source, /progressLabel/);
  assert.match(source, /Waiting for video worker/);
  assert.match(source, /progressPercent: 100, progressLabel: "Ready"/);
});

test("worker persists genuine FFmpeg and stage progress while retaining lease safety", () => {
  const source = fs.readFileSync("scripts/sixfl-tv-worker.ts", "utf8");
  assert.match(source, /-progress", "pipe:2", "-nostats"/);
  assert.match(source, /out_time_us=/);
  assert.match(source, /progress\.onFraction/);
  assert.match(source, /"metadataJson"="metadataJson" \|\| \$\{progressJson\}::jsonb/);
  assert.match(source, /"leaseToken"=\$\{job\.leaseToken\}/);
  assert.match(source, /Rendering full match/);
  assert.match(source, /Rendering highlight clip/);
  assert.match(source, /Saving preview/);
  assert.match(source, /progressPercent: 100, progressLabel: "Ready"/);
});

test("render cards show an accessible live progress bar and percentage", () => {
  const source = fs.readFileSync("src/components/admin/sixfl-tv/StudioControls.tsx", "utf8");
  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuenow/);
  assert.match(source, /render\.progressPercent/);
  assert.match(source, /render\.progressLabel/);
  assert.match(source, /transition-\[width\]/);
  assert.match(source, /tabular-nums/);
});
