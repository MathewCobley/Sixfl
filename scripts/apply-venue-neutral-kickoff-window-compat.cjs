const fs = require("node:fs");
const path = require("node:path");

const relative = "src/app/(admin)/admin/fixtures/generate/division-actions.ts";
const target = path.join(process.cwd(), ...relative.split("/"));
let source = fs.readFileSync(target, "utf8");

const neutralFunction = `function isKickoffAllowed(kickoffAt: Date, team1: TeamSchedulingRule, team2: TeamSchedulingRule) {
  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);
  const team1Latest = parseTimeToMinutes(team1.latestKickoffTime);
  const team2Latest = parseTimeToMinutes(team2.latestKickoffTime);

  if (team1Latest !== null && kickoffMinutes > team1Latest) {
    return { allowed: false, reason: \`${team1.name} cannot kick off later than ${team1.latestKickoffTime}.\` };
  }
  if (team2Latest !== null && kickoffMinutes > team2Latest) {
    return { allowed: false, reason: \`${team2.name} cannot kick off later than ${team2.latestKickoffTime}.\` };
  }
  return { allowed: true, reason: null };
}`;

const compatibleFunction = `function isKickoffAllowed(kickoffAt: Date, homeTeam: TeamSchedulingRule, awayTeam: TeamSchedulingRule) {
  const kickoffMinutes = getLondonMinutesSinceMidnight(kickoffAt);
  const homeLatest = parseTimeToMinutes(homeTeam.latestKickoffTime);
  const awayLatest = parseTimeToMinutes(awayTeam.latestKickoffTime);

  if (homeLatest !== null && kickoffMinutes > homeLatest) {
    return { allowed: false, reason: \`${homeTeam.name} cannot kick off later than ${homeTeam.latestKickoffTime}.\` };
  }
  if (awayLatest !== null && kickoffMinutes > awayLatest) {
    return { allowed: false, reason: \`${awayTeam.name} cannot kick off later than ${awayTeam.latestKickoffTime}.\` };
  }
  return { allowed: true, reason: null };
}`;

if (source.includes(neutralFunction)) {
  source = source.replace(neutralFunction, compatibleFunction);
  fs.writeFileSync(target, source, "utf8");
  console.log("Prepared venue-neutral fixture generator for kick-off window enforcement.");
} else if (source.includes(compatibleFunction) || source.includes("const homeEarliest = parseTimeToMinutes(homeTeam.earliestKickoffTime);")) {
  console.log("Venue-neutral fixture generator is already kick-off-window compatible.");
} else {
  throw new Error("Venue-neutral kick-off window compatibility could not find the generator validator.");
}
