const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("src/app/player-response/[answer]/page.tsx", "utf8");

test("NO unassigns a prospect but a later team-specific YES restores the team", () => {
  assert.match(source, /const noLongerInterested = input\.answer === "NO"/);
  assert.match(
    source,
    /teamId:\s*noLongerInterested\s*\? null\s*:\s*prospect\.teamId \?\? team\?\.id \?\? null/,
  );
  assert.match(source, /status: noLongerInterested \? "DECLINED" : "QUALIFIED"/);
});

test("a YES does not move a prospect already assigned to another team", () => {
  const assignment = source.match(
    /teamId:\s*noLongerInterested\s*\? null\s*:\s*prospect\.teamId \?\? team\?\.id \?\? null/,
  );
  assert.ok(assignment, "team assignment must prefer the prospect's existing team before the response team");
});
