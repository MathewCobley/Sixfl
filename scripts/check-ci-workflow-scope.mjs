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

function pullRequestBlock(source) {
  const match = source.match(/^on:\s*\n([\s\S]*?)(?=^[A-Za-z_-]+:\s*$|^permissions:|^concurrency:|^jobs:)/m);
  if (!match) return "";
  const onBlock = match[1];
  const pull = onBlock.match(/^  pull_request:\s*(?:\n([\s\S]*?))?(?=^  [A-Za-z_-]+:|\s*$)/m);
  return pull ? pull[0] : "";
}

const coreBroadPullRequestWorkflows = new Set([
  ".github/workflows/dom-bridge-policy.yml",
  ".github/workflows/critical-feature-contracts.yml",
  ".github/workflows/pr-hygiene.yml",
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
    }
  }

  const pushMain = /^\s{2}push:\s*(?:\n[\s\S]*?)?^\s{4}branches:\s*(?:\[\s*main\s*\]|\n\s{6}-\s*main\s*$)/m.test(source);
  if (pushMain && !coreBroadPullRequestWorkflows.has(file)) {
    failures.push(`${file}: do not rerun feature CI on every push to main; PR verification plus production deployment is the default.`);
  }
}

if (failures.length) {
  console.error("\nCI WORKFLOW SCOPE POLICY FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nKeep core safety checks broad, but scope every specialist PR check by path, cancel superseded runs, and avoid duplicate main-push CI.\n");
  process.exit(1);
}

console.log(`CI workflow scope policy passed for all ${files.length} workflow file(s).`);
