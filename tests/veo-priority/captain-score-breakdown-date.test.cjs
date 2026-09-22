const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("src/components/captain/CaptainVeoPriorityCard.tsx", "utf8");

test("recent priority score breakdown shows the fixture date", () => {
  assert.match(source, /formatScoreBreakdownMatchDate\(match\.kickoffAt\)/);
  assert.match(source, /timeZone:\s*["']Europe\/London["']/);
  assert.match(source, /weekday:\s*["']short["']/);
  assert.match(source, /year:\s*["']numeric["']/);
});
