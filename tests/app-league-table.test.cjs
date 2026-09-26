const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("captain and player apps share the same aligned mobile league table", () => {
  const table = fs.readFileSync(
    "src/components/league/MobileLeagueTable.tsx",
    "utf8",
  );
  const captain = fs.readFileSync(
    "src/components/captain/CaptainDashboardLeagueTable.tsx",
    "utf8",
  );
  const playerHome = fs.readFileSync(
    "src/components/player/PlayerAppHome.tsx",
    "utf8",
  );
  const playerPage = fs.readFileSync(
    "src/app/player/team/[teamid]/page.tsx",
    "utf8",
  );

  const grid =
    "grid-cols-[3rem_minmax(0,1fr)_2.15rem_2.75rem_2.75rem]";

  assert.equal(
    table.split(grid).length - 1,
    2,
    "header and rows must use the exact same five-column grid",
  );

  assert.match(table, />Pts</);
  assert.match(table, /\{row\.points\}/);
  assert.match(table, /movement === "UP"/);
  assert.match(table, /movement === "DOWN"/);
  assert.match(table, /ArrowUpIcon/);
  assert.match(table, /ArrowDownIcon/);

  assert.match(captain, /import MobileLeagueTable/);
  assert.match(captain, /<MobileLeagueTable/);

  assert.match(playerHome, /League table/);
  assert.match(playerHome, /<MobileLeagueTable rows=\{leagueTableRows\}/);
  assert.match(playerPage, /getLeagueStandings/);
  assert.match(playerPage, /leagueTableRows=\{leagueTableRows\}/);
  assert.match(playerPage, /leagueTableTitle=\{leagueTableTitle\}/);
});
