import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOT = path.resolve(PROJECT_ROOT, "src");
const EXCEPTIONS_PATH = path.resolve(
  PROJECT_ROOT,
  "config/dom-bridge-exceptions.json",
);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const RULES = [
  { name: "MutationObserver", pattern: /\bMutationObserver\b/g },
  {
    name: "DOM query",
    pattern:
      /\bdocument\.(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|createTreeWalker)\b/g,
  },
  { name: "DOM element creation", pattern: /\bdocument\.createElement\b/g },
  {
    name: "DOM insertion",
    pattern:
      /\.(?:appendChild|append|prepend|insertBefore|replaceWith|insertAdjacentElement|insertAdjacentHTML)\s*\(/g,
  },
  { name: "DOM removal", pattern: /\.(?:remove|removeChild)\s*\(/g },
  { name: "HTML replacement", pattern: /\.(?:innerHTML|outerHTML)\s*=/g },
  {
    name: "Class mutation",
    pattern: /\.classList\.(?:add|remove|replace|toggle)\s*\(/g,
  },
  {
    name: "Style mutation",
    pattern: /\.style\.[A-Za-z_$][\w$]*\s*=/g,
  },
  {
    name: "Global DOM monkey patch",
    pattern:
      /(?:Element|HTMLElement|Node|Document)\.prototype\.[A-Za-z_$][\w$]*\s*=/g,
  },
];

function parseArguments(argv) {
  const args = {
    changedFrom: null,
    failOnFindings: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--changed-from") {
      args.changedFrom = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--fail-on-findings") {
      args.failOnFindings = true;
      continue;
    }

    throw new Error(`Unknown audit argument: ${value}`);
  }

  return args;
}

function toRepoPath(absolutePath) {
  return path.relative(PROJECT_ROOT, absolutePath).replaceAll(path.sep, "/");
}

function isSourceFile(repoPath) {
  return (
    repoPath.startsWith("src/") &&
    SOURCE_EXTENSIONS.has(path.extname(repoPath))
  );
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getChangedFiles(baseRef) {
  if (!baseRef) return null;

  const attempts = [
    ["diff", "--name-only", "--diff-filter=ACMR", baseRef, "HEAD", "--", "src"],
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD^", "HEAD", "--", "src"],
  ];

  for (const args of attempts) {
    try {
      const output = execFileSync("git", args, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      return new Set(
        output
          .split(/\r?\n/)
          .map((item) => item.trim().replaceAll("\\", "/"))
          .filter(isSourceFile),
      );
    } catch {
      // Try the parent commit fallback below.
    }
  }

  throw new Error(
    `Could not determine changed source files from ${baseRef}. Ensure the checkout has enough Git history.`,
  );
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

async function loadExceptions() {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(EXCEPTIONS_PATH, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read ${toRepoPath(EXCEPTIONS_PATH)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || !Array.isArray(parsed.exceptions)) {
    throw new Error(
      `${toRepoPath(EXCEPTIONS_PATH)} must contain an "exceptions" array.`,
    );
  }

  const byPath = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const exception of parsed.exceptions) {
    const requiredFields = [
      "path",
      "reason",
      "approvedBy",
      "routeScope",
      "expires",
      "replacementPlan",
    ];

    for (const field of requiredFields) {
      if (typeof exception?.[field] !== "string" || !exception[field].trim()) {
        throw new Error(
          `DOM bridge exception is missing a valid ${field}: ${JSON.stringify(
            exception,
          )}`,
        );
      }
    }

    const repoPath = exception.path.trim().replaceAll("\\", "/");
    if (!isSourceFile(repoPath)) {
      throw new Error(`DOM bridge exception path must be under src/: ${repoPath}`);
    }
    if (byPath.has(repoPath)) {
      throw new Error(`Duplicate DOM bridge exception for ${repoPath}`);
    }

    const expiry = new Date(`${exception.expires}T00:00:00Z`);
    if (Number.isNaN(expiry.getTime())) {
      throw new Error(`Invalid DOM bridge exception expiry for ${repoPath}`);
    }

    byPath.set(repoPath, {
      ...exception,
      path: repoPath,
      expired: expiry < today,
    });
  }

  return byPath;
}

function printFindings(byFile, exceptionByPath) {
  for (const [file, fileFindings] of [...byFile.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const exception = exceptionByPath.get(file);
    const exceptionLabel = exception
      ? exception.expired
        ? " [EXCEPTION EXPIRED]"
        : ` [temporary exception until ${exception.expires}]`
      : "";

    console.log(`\n${file}${exceptionLabel}`);
    for (const finding of fileFindings) {
      console.log(`  L${finding.line}  ${finding.rule}: ${finding.token}`);
    }

    if (exception) {
      console.log(`  Reason: ${exception.reason}`);
      console.log(`  Route scope: ${exception.routeScope}`);
      console.log(`  Replacement: ${exception.replacementPlan}`);
      console.log(`  Approved by: ${exception.approvedBy}`);
    }
  }
}

const args = parseArguments(process.argv.slice(2));
const changedFiles = getChangedFiles(args.changedFrom);
const exceptionByPath = await loadExceptions();
const allFiles = await walk(SOURCE_ROOT);
const files = changedFiles
  ? allFiles.filter((file) => changedFiles.has(toRepoPath(file)))
  : allFiles;
const findings = [];

for (const file of files) {
  const content = await readFile(file, "utf8");

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;

    while ((match = rule.pattern.exec(content)) !== null) {
      findings.push({
        file: toRepoPath(file),
        line: getLineNumber(content, match.index),
        rule: rule.name,
        token: match[0],
      });
    }
  }
}

const byFile = new Map();
for (const finding of findings) {
  const list = byFile.get(finding.file) ?? [];
  list.push(finding);
  byFile.set(finding.file, list);
}

const scopeLabel = changedFiles
  ? `${changedFiles.size} changed source file(s)`
  : "the full source tree";
console.log(
  `DOM bridge audit checked ${scopeLabel}: ${byFile.size} file(s), ${findings.length} suspicious operation(s).`,
);
printFindings(byFile, exceptionByPath);

const unapprovedFiles = [...byFile.keys()].filter((file) => {
  const exception = exceptionByPath.get(file);
  return !exception || exception.expired;
});

if (args.failOnFindings && unapprovedFiles.length > 0) {
  console.error(
    `\nDOM bridge policy failed for ${unapprovedFiles.length} changed file(s).`,
  );
  console.error(
    "Implement the feature in the owning React/Next.js component, or add a complete, approved and unexpired temporary exception to config/dom-bridge-exceptions.json.",
  );
  process.exitCode = 1;
} else if (byFile.size > 0) {
  console.log(
    "\nThese findings are the legacy audit inventory. Page scraping and post-render mutation must be replaced at source rather than expanded.",
  );
}
