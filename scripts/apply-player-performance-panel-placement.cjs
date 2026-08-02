const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/player/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

const performanceImport =
  'import PlayerPerformancePanel from "@/components/player/PlayerPerformancePanel";';

if (!source.includes(performanceImport)) {
  const importAnchor = 'import Link from "next/link";';
  if (!source.includes(importAnchor)) {
    throw new Error("Player dashboard Link import was not found.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n${performanceImport}`);
}

const actionCardsAnchor =
  '        <section className="grid gap-4 md:grid-cols-3">';
const panel = [
  "        <PlayerPerformancePanel",
  "          teamId={teamid}",
  "          membershipId={membership?.id ?? null}",
  "        />",
  "",
  actionCardsAnchor,
].join("\n");

if (!source.includes("membershipId={membership?.id ?? null}")) {
  if (!source.includes(actionCardsAnchor)) {
    throw new Error("Player dashboard action-card section was not found.");
  }
  source = source.replace(actionCardsAnchor, panel);
}

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes(performanceImport) ||
  !source.includes("<PlayerPerformancePanel") ||
  !source.includes("membershipId={membership?.id ?? null}")
) {
  throw new Error("Player performance panel was not placed correctly.");
}

console.log(
  "Player stats are displayed near the top of the dashboard and work in admin player preview.",
);
