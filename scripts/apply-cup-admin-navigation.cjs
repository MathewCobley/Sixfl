const fs = require("node:fs");
const path = require("node:path");

const sidebarPath = path.join(
  process.cwd(),
  "src",
  "components",
  "admin",
  "AdminSidebar.tsx",
);

if (!fs.existsSync(sidebarPath)) {
  throw new Error("Admin sidebar not found while adding cup navigation.");
}

let source = fs.readFileSync(sidebarPath, "utf8");
let changed = false;

if (!source.includes('name: "Cups"')) {
  const leagueItem = `      {\n        name: "Leagues",\n        href: "/admin/leagues",\n        icon: TrophyIcon,\n        description: "Setup",\n      },`;

  if (!source.includes(leagueItem)) {
    throw new Error("Could not find the Leagues navigation item for Cups insertion.");
  }

  const cupItem = `${leagueItem}\n      {\n        name: "Cups",\n        href: "/admin/cups",\n        icon: TrophyIcon,\n        description: "Inter-league",\n      },`;

  source = source.replace(leagueItem, cupItem);
  changed = true;
}

if (!source.includes('href: "/admin/cups"')) {
  throw new Error("Cups navigation link was not applied.");
}

if (changed) {
  fs.writeFileSync(sidebarPath, source, "utf8");
  console.log("Added Cups to the admin League setup navigation.");
} else {
  console.log("Admin Cups navigation already applied.");
}
