const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

// Keep the rules archive visible inside the existing Back end functions admin group.
{
  const file = "src/components/admin/AdminSidebar.tsx";
  let source = read(file);

  if (!source.includes('href: "/admin/rules-archive"')) {
    const anchor = `      {\n        name: "Email audit",\n        href: "/admin/email-audit",\n        icon: MagnifyingGlassIcon,\n        description: "Address counts",\n      },`;
    const replacement = `${anchor}\n      {\n        name: "Rules archive",\n        href: "/admin/rules-archive",\n        icon: DocumentTextIcon,\n        description: "Versions",\n      },`;

    if (!source.includes(anchor)) {
      throw new Error("Rules archive admin navigation anchor not found.");
    }

    source = source.replace(anchor, replacement);
    write(file, source);
  }
}

const leagueRules = read("src/lib/league-rules.ts");
const matchRules = read("src/lib/match-rules.ts");
const agreement = read("src/lib/league-agreement.ts");
const archive = read("src/lib/rules-archive.ts");
const captainGuide = read("src/app/captain/team/[teamid]/guide/page.tsx");

const checks = [
  [leagueRules.includes('LEAGUE_RULES_VERSION = "2.0"'), "League Rules must remain on v2.0"],
  [leagueRules.includes("administrative forfeit result will be 3–0"), "League Rules must define the default 3–0 forfeit result"],
  [leagueRules.includes("less than 24 hours before kick-off"), "League Rules must retain the late-cancellation rule"],
  [leagueRules.includes("There is no automatic right to an independent appeal"), "League Rules must retain the review/appeal wording"],
  [matchRules.includes("Shin pads are mandatory"), "Match Rules must retain mandatory shin pads"],
  [matchRules.includes("A dismissed player must promptly leave"), "Match Rules must retain the red-card leave requirement"],
  [matchRules.includes("does not by itself establish that it did not happen"), "Match Rules must retain limited-camera evidence wording"],
  [agreement.includes('LEAGUE_AGREEMENT_VERSION = "2.0"'), "League agreement must remain on v2.0"],
  [archive.includes('id: "league-rules-1-4"'), "League Rules v1.4 must remain archived"],
  [archive.includes('id: "match-rules-1-4"'), "Match Rules v1.4 must remain archived"],
  [archive.includes('id: "league-agreement-1-2"'), "League Agreement v1.2 must remain archived"],
  [captainGuide.includes("accepted before version tracking"), "Captain guide must show legacy acceptance state"],
];

const failures = checks.filter(([ok]) => !ok);
if (failures.length > 0) {
  console.error("Rules v2 hardening contract failed:");
  for (const [, message] of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Rules v2 hardening contract passed.");
