const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

const layoutPath = "src/app/(admin)/admin/layout.tsx";
let layout = read(layoutPath);
layout = layout
  .replaceAll(
    'import FreeKitTeamBadgesBridge from "@/components/admin/teams/FreeKitTeamBadgesBridge";\n',
    "",
  )
  .replaceAll("      <FreeKitTeamBadgesBridge />\n", "");
write(layoutPath, layout);

const pagePath = "src/app/(admin)/admin/teams/page.tsx";
let page = read(pagePath);

const prismaImport = 'import { prisma } from "@/lib/prisma";';
const kitQuantityImport =
  'import { TEAM_KIT_QUANTITY } from "@/lib/kits/constants";';
if (!page.includes(kitQuantityImport)) {
  if (!page.includes(prismaImport)) {
    throw new Error("Admin teams Prisma import was not found.");
  }
  page = page.replace(prismaImport, `${kitQuantityImport}\n${prismaImport}`);
}

if (!page.includes("      wantsFreeKit: true,")) {
  page = page.replace(
    "      teamMode: true,\n      latestKickoffTime: true,",
    "      teamMode: true,\n      wantsFreeKit: true,\n      latestKickoffTime: true,",
  );
}

if (!page.includes("          wantsFreeKit: true,")) {
  page = page.replace(
    [
      "      convertedFromLead: {",
      "        select: {",
      "          contactName: true,",
      "          email: true,",
      "          phone: true,",
      "        },",
      "      },",
    ].join("\n"),
    [
      "      convertedFromLead: {",
      "        select: {",
      "          contactName: true,",
      "          email: true,",
      "          phone: true,",
      "          wantsFreeKit: true,",
      "        },",
      "      },",
    ].join("\n"),
  );
}

if (!page.includes("function hasFreeKitOffer(team: TeamListItem)")) {
  const contactPhoneFunction = [
    "function getContactPhone(team: TeamListItem) {",
    '  return team.contactPhone || team.convertedFromLead?.phone || "—";',
    "}",
  ].join("\n");

  if (!page.includes(contactPhoneFunction)) {
    throw new Error("Admin teams contact helper was not found.");
  }

  page = page.replace(
    contactPhoneFunction,
    [
      contactPhoneFunction,
      "",
      "function hasFreeKitOffer(team: TeamListItem) {",
      "  return Boolean(team.wantsFreeKit || team.convertedFromLead?.wantsFreeKit);",
      "}",
    ].join("\n"),
  );
}

if (!page.includes("const hasIncludedKitOffer = hasFreeKitOffer(team);")) {
  page = page.replace(
    '                const isManagedTeam = team.teamMode === "MANAGED";',
    [
      '                const isManagedTeam = team.teamMode === "MANAGED";',
      "                const hasIncludedKitOffer = hasFreeKitOffer(team);",
    ].join("\n"),
  );
}

if (!page.includes("{TEAM_KIT_QUANTITY} free kits")) {
  const nextBadgeMarker = "                          {team.latestKickoffTime ? (";
  if (!page.includes(nextBadgeMarker)) {
    throw new Error("Admin team badge position was not found.");
  }

  const freeKitBadge = [
    "                          {hasIncludedKitOffer ? (",
    '                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">',
    "                              {TEAM_KIT_QUANTITY} free kits",
    "                            </span>",
    "                          ) : null}",
  ].join("\n");

  page = page.replace(nextBadgeMarker, `${freeKitBadge}\n${nextBadgeMarker}`);
}

write(pagePath, page);

if (
  layout.includes("FreeKitTeamBadgesBridge") ||
  !page.includes("function hasFreeKitOffer(team: TeamListItem)") ||
  !page.includes("{TEAM_KIT_QUANTITY} free kits") ||
  !page.includes("wantsFreeKit: true")
) {
  throw new Error("Native admin free-kit team badges were not applied correctly.");
}

console.log(
  "Admin team free-kit badges now render from queried team data without DOM injection.",
);
