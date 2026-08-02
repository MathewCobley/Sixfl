const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/player/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in player team page.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  '            <div className="mt-6 border-t border-white/10 pt-6">',
  '            <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">',
  "team switcher panel",
);

replaceRequired(
  [
    '              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">',
    "                <div>",
    '                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">',
    "                    Your teams",
    "                  </p>",
    '                  <h2 className="mt-2 text-lg font-semibold text-white">Switch team</h2>',
    '                  <p className="mt-1 text-sm text-white/60">',
    "                    You are registered for {playerMemberships.length} teams. Each team has its own fixtures, availability and match fees.",
    "                  </p>",
    "                </div>",
    '                <span className="w-fit rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100">',
    "                  {playerMemberships.length} teams",
    "                </span>",
    "              </div>",
  ].join("\n"),
  [
    '              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
    '                <div className="min-w-0 flex-1">',
    '                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">',
    "                    Your teams",
    "                  </p>",
    '                  <h2 className="mt-1.5 text-lg font-semibold text-white">Choose a team</h2>',
    '                  <p className="mt-1 max-w-2xl text-sm leading-5 text-white/60">',
    "                    Open a team to view its fixtures, availability and match fees.",
    "                  </p>",
    "                </div>",
    '                <span className="w-fit shrink-0 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100">',
    "                  {playerMemberships.length} teams",
    "                </span>",
    "              </div>",
  ].join("\n"),
  "team switcher heading",
);

replaceRequired(
  '              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
  '              <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">',
  "team switcher grid",
);

replaceRequired(
  '                    <div className="flex min-w-0 items-center gap-3">',
  '                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">',
  "team switcher card spacing",
);

replaceRequired(
  '                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">',
  '                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/25 sm:h-12 sm:w-12">',
  "team switcher badge size",
);

replaceRequired(
  "                        {isCurrentTeam ? \"Current team\" : \"Open team\"}",
  "                        {isCurrentTeam ? \"Viewing\" : \"Switch\"}",
  "team switcher action label",
);

replaceRequired(
  '                      className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4"',
  '                      className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4"',
  "current team card width",
);

replaceRequired(
  '                      className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-violet-300/35 hover:bg-violet-500/10"',
  '                      className="block w-full rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-violet-300/35 hover:bg-violet-500/10"',
  "switch team card width",
);

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("Choose a team") ||
  !source.includes("Open a team to view its fixtures") ||
  !source.includes('{isCurrentTeam ? "Viewing" : "Switch"}') ||
  source.includes("You are registered for {playerMemberships.length} teams")
) {
  throw new Error("Player team switcher layout was not polished correctly.");
}

console.log("Player team switcher now has a compact, readable layout.");
