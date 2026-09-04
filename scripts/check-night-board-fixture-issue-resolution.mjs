import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const panel = read(
  "src/components/admin/night-board/NightBoardTeamIssuesPanel.tsx",
);
const issueCard = read(
  "src/components/admin/night-board/NightBoardTeamIssueCard.tsx",
);
const resolveAction = read(
  "src/app/(admin)/admin/fixtures/issue-actions.ts",
);

expect(
  panel.includes("NightBoardTeamIssueCard") &&
    panel.includes('case "issue_resolved"') &&
    panel.includes('notice === "issue_resolved"'),
  "the Night Board drawer must render native issue cards and show a successful resolution notice",
);

expect(
  issueCard.includes("resolveFixtureConfirmationIssueAction") &&
    issueCard.includes("action={resolveFixtureConfirmationIssueAction}") &&
    issueCard.includes('name="returnTo"') &&
    issueCard.includes("Resolve issue"),
  "every Night Board issue card must expose the server-backed Resolve issue action and preserve the selected Night Board URL",
);

expect(
  issueCard.includes("returns the team") &&
    issueCard.includes("awaiting confirmation") &&
    issueCard.includes("does not send an email"),
  "the Night Board resolve control must explain that resolution returns confirmation to pending without emailing the team",
);

expect(
  resolveAction.includes("await requireAdmin()") &&
    resolveAction.includes('formData.get("returnTo")') &&
    resolveAction.includes('url.pathname !== "/admin/night-board"') &&
    resolveAction.includes('return "issue_resolved"'),
  "fixture issue resolution must remain admin-only and use a validated Night Board return URL",
);

expect(
  resolveAction.includes('status: "ISSUE_RAISED"') &&
    resolveAction.includes('status: "PENDING"') &&
    resolveAction.includes("note: null") &&
    resolveAction.includes("issueRaisedAt: null"),
  "resolution must close only an open raised issue and restore the team confirmation to a clean pending state",
);

expect(
  resolveAction.includes('revalidatePath("/admin/night-board")') &&
    resolveAction.includes('return `/admin/fixtures?${params.toString()}#fixture-issue-replies`'),
  "resolution must refresh the Night Board while preserving the existing Admin Fixtures fallback flow",
);

if (failures.length) {
  console.error("\nNIGHT BOARD FIXTURE ISSUE RESOLUTION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until fixture issues can still be resolved safely from the Night Board drawer.\n");
  process.exit(1);
}

console.log("Night Board fixture issue resolution contract passed.");
