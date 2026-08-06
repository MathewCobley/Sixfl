const fs = require("node:fs");
const path = require("node:path");

const componentPath = path.join(
  process.cwd(),
  "src",
  "components",
  "captain",
  "TemporaryPlayerPassLauncher.tsx",
);

if (!fs.existsSync(componentPath)) {
  console.log("Temporary player pass launcher not present; skipping team-label clarity patch.");
  process.exit(0);
}

let source = fs.readFileSync(componentPath, "utf8");

source = source.replaceAll(
  '<optgroup label="Past matches — claim an appearance">',
  '<optgroup label="Past matches — choose the team you played for">',
);

source = source.replaceAll(
  '{pass.teamName} vs {pass.opponentName}',
  'Team: {pass.teamName} · Opponent: {pass.opponentName}',
);

source = source.replace(
  '<div className="font-semibold">Played previously?</div>\n                    <p className="mt-1 text-sky-100/75">Choose a completed match from the last 30 days and send a claim. The captain will see it automatically and must accept it before the appearance is linked to your account.</p>',
  '<div className="font-semibold">Played previously?</div>\n                    <p className="mt-1 text-sky-100/75">Choose the team you played for and the completed match from the last 30 days. The team named first is the team you are claiming to have represented. The captain will see it automatically and must accept it before the appearance is linked to your account.</p>',
);

source = source.replace(
  '{choice.teamName} · {formatDateTime(choice.kickoffAt)} vs {choice.opponentName}',
  'Play for {choice.teamName} · {formatDateTime(choice.kickoffAt)} · vs {choice.opponentName}',
);

const pastOption = [
  '                              >',
  '                                {choice.teamName} · {formatDateTime(choice.kickoffAt)} vs {choice.opponentName}',
  '                              </option>',
].join("\n");
const clearerPastOption = [
  '                              >',
  '                                Played for {choice.teamName} · {formatDateTime(choice.kickoffAt)} · vs {choice.opponentName}',
  '                              </option>',
].join("\n");
if (source.includes(pastOption)) {
  source = source.replace(pastOption, clearerPastOption);
}

if (
  !source.includes("Past matches — choose the team you played for") ||
  !source.includes("Team: {pass.teamName} · Opponent: {pass.opponentName}")
) {
  throw new Error("Temporary-player team selection wording was not applied.");
}

fs.writeFileSync(componentPath, source, "utf8");
console.log("Temporary-player claims now make the represented team explicit.");
