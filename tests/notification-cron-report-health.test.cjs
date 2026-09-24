const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("matchnight report holds are warnings, not notification-cron failures", () => {
  const route = fs.readFileSync("src/app/api/cron/notifications/route.ts", "utf8");

  assert.match(route, /type CronWarning/);
  assert.match(route, /const warnings: CronWarning\[\] = \[\]/);
  assert.match(route, /matchnightReports\.value\.results\.filter/);
  assert.match(route, /result\.status === "failed"/);
  assert.match(route, /warnings\.push\(\{/);
  assert.match(route, /automatic-matchnight-reports held/);
  assert.doesNotMatch(
    route,
    /if \(matchnightReports\.ok && matchnightReports\.value\.failed > 0\) \{\s*failures\.push/,
    "Per-league report failures must not make healthy notification delivery return HTTP 500",
  );
  assert.match(route, /warnings\.length > 0/);
  assert.match(route, /Notification cron completed successfully with/);
  assert.match(route, /status: failures\.length === 0 \? 200 : 500/);
});

test("real cron exceptions still fail Railway", () => {
  const route = fs.readFileSync("src/app/api/cron/notifications/route.ts", "utf8");

  assert.match(route, /runCronStep\(\s*"automatic-matchnight-reports",\s*failures,/);
  assert.match(route, /failures\.push\(\{ step, error: message \}\)/);
});
