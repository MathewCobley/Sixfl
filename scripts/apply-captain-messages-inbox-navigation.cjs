const fs = require("node:fs");
const path = require("node:path");

const layoutPath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);

let source = fs.readFileSync(layoutPath, "utf8");

const helperImport =
  'import { getCaptainUnreadMessageCount } from "@/lib/messaging/captain-inbox";';
if (!source.includes(helperImport)) {
  const importAnchor = 'import { prisma } from "@/lib/prisma";';
  if (!source.includes(importAnchor)) {
    throw new Error("Captain layout Prisma import was not found.");
  }
  source = source.replace(importAnchor, `${helperImport}\n${importAnchor}`);
}

const teamGuard = [
  "  if (!team) {",
  "    notFound();",
  "  }",
  "",
  "  const displayCompetition = team.league?.competition ?? null;",
].join("\n");
const teamGuardWithUnread = [
  "  if (!team) {",
  "    notFound();",
  "  }",
  "",
  "  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);",
  "",
  "  const displayCompetition = team.league?.competition ?? null;",
].join("\n");

if (!source.includes("const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);")) {
  if (!source.includes(teamGuard)) {
    throw new Error("Captain layout team guard was not found.");
  }
  source = source.replace(teamGuard, teamGuardWithUnread);
}

const whatsappItem =
  '        { href: `/captain/team/${teamid}/whatsapp`, label: "WhatsApp" },';
const messagesItem = [
  "        {",
  "          href: `/captain/team/${teamid}/messages`,",
  "          label:",
  "            unreadMessageCount > 0",
  "              ? `Messages ${unreadMessageCount}`",
  '              : "Messages",',
  "        },",
].join("\n");

if (!source.includes('href: `/captain/team/${teamid}/messages`')) {
  if (!source.includes(whatsappItem)) {
    throw new Error("Captain WhatsApp navigation item was not found.");
  }
  source = source.replace(whatsappItem, `${messagesItem}\n${whatsappItem}`);
}

if (
  !source.includes(helperImport) ||
  !source.includes("const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);") ||
  !source.includes('href: `/captain/team/${teamid}/messages`') ||
  !source.includes("? `Messages ${unreadMessageCount}`")
) {
  throw new Error("Captain Messages navigation was not applied correctly.");
}

fs.writeFileSync(layoutPath, source, "utf8");
console.log(
  "Captain navigation now includes the team Messages inbox with an unread count.",
);
