const fs = require("node:fs");
const path = require("node:path");

const tablePath = path.join(
  process.cwd(),
  "src",
  "components",
  "leagues",
  "LeagueTableCard.tsx",
);

if (!fs.existsSync(tablePath)) {
  console.log("League table card not present; skipping form-row layout fix.");
  process.exit(0);
}

let source = fs.readFileSync(tablePath, "utf8");

// An earlier version of this patch matched the first generic flex row, which
// was the mobile team-name row rather than the desktop Form column. Restore
// that row if a previous local predev run changed it.
source = source.replace(
  '<div className="flex flex-nowrap items-center gap-1.5">\n                            {showTeamLinks ? (',
  '<div className="flex flex-wrap items-center gap-2">\n                            {showTeamLinks ? (',
);

// Target the desktop form cell specifically. Five 28px badges plus four 6px
// gaps fit inside the existing 170px Form column without wrapping.
source = source.replace(
  '<div className="flex flex-wrap items-center gap-2">\n                        {row.recentForm.length > 0 ? (',
  '<div className="flex flex-nowrap items-center gap-1.5">\n                        {row.recentForm.length > 0 ? (',
);
source = source.replace(
  'className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-black ${getFormBadgeClasses(',
  'className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-black ${getFormBadgeClasses(',
);

if (
  !source.includes(
    '<div className="flex flex-nowrap items-center gap-1.5">\n                        {row.recentForm.length > 0 ? (',
  ) ||
  !source.includes("inline-flex h-7 w-7 shrink-0")
) {
  throw new Error("Desktop league table form-row layout fix was not applied correctly.");
}

fs.writeFileSync(tablePath, source, "utf8");
console.log("Desktop league table form badges now remain on one row.");
