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

const oldLauncher = [
  '      <button',
  '        type="button"',
  '        onClick={() => void openLauncher()}',
  '        className={',
  '          captainMatch',
  '            ? "fixed bottom-5 right-5 z-[90] rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-black shadow-2xl hover:bg-emerald-300"',
  '            : "fixed bottom-5 right-5 z-[90] rounded-full border border-emerald-400/30 bg-[#10241b] px-5 py-3 text-sm font-semibold text-emerald-100 shadow-2xl hover:bg-[#163326]"',
  '        }',
  '      >',
  '        {captainMatch ? "+ Add temporary player" : "Play for another team"}',
  '      </button>',
].join("\n");

const clearerLauncher = [
  '      {captainMatch ? (',
  '        <button',
  '          type="button"',
  '          onClick={() => void openLauncher()}',
  '          className="fixed bottom-5 right-5 z-[90] rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-black shadow-2xl hover:bg-emerald-300"',
  '        >',
  '          + Add temporary player',
  '        </button>',
  '      ) : (',
  '        <div className="fixed bottom-5 right-5 z-[90] w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-emerald-400/25 bg-[#10241b]/95 p-3 shadow-2xl backdrop-blur">',
  '          <p className="text-xs leading-5 text-emerald-50/70">',
  '            Playing for, or played for, another SIXFL team? Link yourself to their fixture so your match fee can be set up.',
  '          </p>',
  '          <button',
  '            type="button"',
  '            onClick={() => void openLauncher()}',
  '            className="mt-3 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"',
  '          >',
  '            Set up match fee',
  '          </button>',
  '        </div>',
  '      )}',
].join("\n");

if (source.includes(oldLauncher)) {
  source = source.replace(oldLauncher, clearerLauncher);
}

source = source.replace(
  '{captainMatch ? "Add a temporary player" : "Play for another team"}',
  '{captainMatch ? "Add a temporary player" : "Set up a match fee"}',
);

if (
  !source.includes("Past matches — choose the team you played for") ||
  !source.includes("Team: {pass.teamName} · Opponent: {pass.opponentName}") ||
  !source.includes("Set up match fee") ||
  !source.includes("Playing for, or played for, another SIXFL team?")
) {
  throw new Error("Temporary-player team selection and launcher wording was not applied.");
}

fs.writeFileSync(componentPath, source, "utf8");
console.log("Temporary-player claims now make the represented team and match-fee purpose explicit.");
