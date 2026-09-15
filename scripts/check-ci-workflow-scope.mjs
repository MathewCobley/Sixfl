import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workflowRoot = path.join(root, ".github", "workflows");

function workflowFiles() {
  return fs
    .readdirSync(workflowRoot)
    .filter((value) => /\.ya?ml$/i.test(value))
    .map((value) => `.github/workflows/${value}`)
    .sort();
}

function eventBlock(source, eventName) {
  const match = source.match(/^on:\s*\n([\s\S]*?)(?=^[A-Za-z_-]+:\s*$|^permissions:|^concurrency:|^jobs:)/m);
  if (!match) return "";
  const onBlock = match[1];
  const event = onBlock.match(
    new RegExp(`^  ${eventName}:\\s*(?:\\n([\\s\\S]*?))?(?=^  [A-Za-z_-]+:|\\s*$)`, "m"),
  );
  return event ? event[0] : "";
}

function pullRequestBlock(source) {
  return eventBlock(source, "pull_request");
}

function blockIncludesBranch(block, branch) {
  if (!block) return false;

  const inline = block.match(/^\s{4}branches:\s*\[([^\]]*)\]\s*$/m);
  if (inline) {
    return inline[1]
      .split(",")
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
      .includes(branch);
  }

  const multiline = block.match(/^\s{4}branches:\s*\n((?:\s{6}-[^\n]*\n?)*)/m);
  if (!multiline) return false;

  return multiline[1]
    .split(/\r?\n/)
    .map((value) => value.replace(/^\s{6}-\s*/, "").trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .includes(branch);
}

const coreBroadPullRequestWorkflows = new Set([
  ".github/workflows/dom-bridge-policy.yml",
  ".github/workflows/critical-feature-contracts.yml",
  ".github/workflows/pr-hygiene.yml",
]);

// This workflow keeps a lightweight post-deploy public-page verifier on main.
// Its heavyweight `rules` job is explicitly disabled for push events.
const allowedMainPushWorkflows = new Set([
  ".github/workflows/matchday-player-limit-rules.yml",
]);

// Function bundle size is dependency-wide by design: any shared server library
// can change a deployed function package even if that library is not owned by a
// single feature. Other specialist workflows should never use an exact src/**
// catch-all because it makes unrelated application changes start them.
const allowedBroadSourceWorkflows = new Set([
  ".github/workflows/vercel-function-bundles.yml",
]);

const failures = [];
const files = workflowFiles();

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const hasPullRequest = /^\s{2}pull_request:/m.test(source) || /^\s{2}pull_request_target:/m.test(source);

  if (hasPullRequest) {
    if (!/^concurrency:/m.test(source) || !/^\s{2}cancel-in-progress:\s*true\s*$/m.test(source)) {
      failures.push(`${file}: pull-request workflows must cancel superseded runs with concurrency/cancel-in-progress.`);
    }

    if (/^\s{2}pull_request:/m.test(source) && !coreBroadPullRequestWorkflows.has(file)) {
      const block = pullRequestBlock(source);
      if (!/^\s{4}paths:/m.test(block)) {
        failures.push(`${file}: feature pull-request workflows must declare paths so unrelated PRs do not start them.`);
      }

      const exactSrcCatchAll = /^\s{6}-\s*["']?src\/\*\*["']?\s*$/m.test(block);
      if (exactSrcCatchAll && !allowedBroadSourceWorkflows.has(file)) {
        failures.push(`${file}: specialist workflows must not use an exact src/** catch-all; list the feature-owned source paths instead.`);
      }
    }
  }

  const pushBlock = eventBlock(source, "push");
  const pushesMain = blockIncludesBranch(pushBlock, "main");
  if (pushesMain && !coreBroadPullRequestWorkflows.has(file) && !allowedMainPushWorkflows.has(file)) {
    failures.push(`${file}: do not rerun feature CI on every push to main; PR verification plus production deployment is the default.`);
  }

  if (allowedMainPushWorkflows.has(file)) {
    if (!/^\s{4}if:\s*github\.event_name != 'push'\s*$/m.test(source)) {
      failures.push(`${file}: the heavyweight PR verification job must stay disabled on main push events.`);
    }
    if (!/^\s{2}live-publication:\s*$/m.test(source)) {
      failures.push(`${file}: the allowed main-push exception is only for the lightweight live-publication verifier.`);
    }
  }
}

if (failures.length) {
  console.error("\nCI WORKFLOW SCOPE POLICY FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nKeep core safety checks broad, but scope every specialist PR check by path, cancel superseded runs, and avoid duplicate main-push CI.\n");
  process.exit(1);
}

console.log(`CI workflow scope policy passed for all ${files.length} workflow file(s).`);
