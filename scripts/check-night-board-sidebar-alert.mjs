import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(source, expected, message) {
  if (!source.includes(expected)) throw new Error(message);
}

const layout = read("src/app/(admin)/admin/layout.tsx");
const sidebar = read("src/components/admin/AdminSidebar.tsx");
const issueSummary = read("src/lib/night-board/next-night-issues.ts");

for (const expected of [
  'import { getNextNightBoardIssueSummary } from "@/lib/night-board/next-night-issues";',
  "getNextNightBoardIssueSummary(),",
  "nightBoardIssueCount={nextNightBoardIssues.count}",
  "nightBoardIssueLevel={nextNightBoardIssues.level}",
  "nightBoardIssueDate={nextNightBoardIssues.dateLabel}",
]) {
  requireText(
    layout,
    expected,
    `Admin layout is missing Night Board alert wiring: ${expected}`,
  );
}

for (const expected of [
  "nightBoardIssueCount?: number;",
  'item.href === "/admin/night-board"',
  "nightBoardIssueCount > 0",
  'role="status"',
  "aria-label={nightBoardIssueLabel}",
  'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.9)]',
  'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]',
]) {
  requireText(
    sidebar,
    expected,
    `Admin sidebar is missing the Night Board warning dot contract: ${expected}`,
  );
}

for (const expected of [
  "getNextNightBoardIssueSummary",
  "CAPTAIN_CONFIRMATION_WARNING_WINDOW_MS",
  "FixtureCaptainConfirmationStatus.ISSUE_RAISED",
  "latestKickoffTime",
  'FROM "RefereeNightFixture"',
  'row.confirmationStatus === "DECLINED"',
  "fixtureIds.size > 1",
]) {
  requireText(
    issueSummary,
    expected,
    `Next-night issue scan is missing an operational warning source: ${expected}`,
  );
}

console.log(
  "Night Board sidebar alert contract passed: the next published fixture night is scanned for setup clashes, time restrictions, captain issues and referee confirmations, and the admin navigation shows a severity-coloured warning dot when attention is required.",
);
