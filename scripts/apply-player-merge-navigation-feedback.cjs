const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

const mergePagePath = "src/app/(admin)/admin/players/merge/[userId]/page.tsx";
let mergePage = read(mergePagePath);

if (!mergePage.includes('import MergePlayerSubmitButton from "@/components/admin/players/MergePlayerSubmitButton";')) {
  mergePage = mergePage.replace(
    'import Link from "next/link";\n',
    'import Link from "next/link";\nimport MergePlayerSubmitButton from "@/components/admin/players/MergePlayerSubmitButton";\n',
  );
}

const oldSubmitButton = [
  "        <button",
  '          type="submit"',
  '          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-red-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-red-300"',
  "        >",
  "          Keep {keptLabel} — merge and disable {duplicateLabel}",
  "        </button>",
].join("\n");
const newSubmitButton = [
  "        <MergePlayerSubmitButton",
  "          keptLabel={keptLabel}",
  "          duplicateLabel={duplicateLabel}",
  "        />",
].join("\n");

if (mergePage.includes(oldSubmitButton)) {
  mergePage = mergePage.replace(oldSubmitButton, newSubmitButton);
}

const oldBackLink = [
  "            <Link",
  "              href={`/admin/teams/${teamId}/squad`}",
  '              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"',
  "            >",
  "              Back to squad",
  "            </Link>",
].join("\n");
const newBackLink = [
  "            <a",
  "              href={`/admin/teams/${teamId}/squad`}",
  '              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"',
  "            >",
  "              Back to squad",
  "            </a>",
].join("\n");

if (mergePage.includes(oldBackLink)) {
  mergePage = mergePage.replace(oldBackLink, newBackLink);
}

write(mergePagePath, mergePage);

const actionsPath = "src/app/(admin)/admin/players/merge/actions.ts";
let actions = read(actionsPath);
const oldSuccessRedirect = [
  "  redirect(",
  "    mergePagePath({",
  "      userId: result.keptUserId,",
  "      teamId,",
  "      merged: true,",
  "    }),",
  "  );",
].join("\n");
const newSuccessRedirect = [
  "  if (teamId) {",
  "    redirect(`/admin/teams/${teamId}/squad?saved=player-merged`);",
  "  }",
  "",
  oldSuccessRedirect,
].join("\n");

if (!actions.includes("squad?saved=player-merged") && actions.includes(oldSuccessRedirect)) {
  actions = actions.replace(oldSuccessRedirect, newSuccessRedirect);
  write(actionsPath, actions);
}

const squadPagePath = "src/app/(admin)/admin/teams/[id]/squad/page.tsx";
let squadPage = read(squadPagePath);
const oldSavedCases = [
  '    case "moved-to-prospects":',
  '      return "Player moved back to prospects and unlinked from the active squad.";',
  "    default:",
].join("\n");
const newSavedCases = [
  '    case "moved-to-prospects":',
  '      return "Player moved back to prospects and unlinked from the active squad.";',
  '    case "player-merged":',
  '      return "Player accounts merged successfully. All squad cards and player history are now linked to the surviving account.";',
  "    default:",
].join("\n");

if (!squadPage.includes('case "player-merged":') && squadPage.includes(oldSavedCases)) {
  squadPage = squadPage.replace(oldSavedCases, newSavedCases);
  write(squadPagePath, squadPage);
}

const checks = [
  mergePage.includes("MergePlayerSubmitButton"),
  mergePage.includes("Merging accounts") || mergePage.includes("<MergePlayerSubmitButton"),
  mergePage.includes("<a\n              href={`/admin/teams/${teamId}/squad`}"),
  actions.includes("squad?saved=player-merged"),
  squadPage.includes('case "player-merged":'),
];

if (checks.some((check) => !check)) {
  throw new Error("Player merge navigation and progress feedback were not applied correctly.");
}

console.log(
  "Player merges now show progress, return to the squad with a success message, and use a fresh navigation back to the squad.",
);
