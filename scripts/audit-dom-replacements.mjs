import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const MANIFEST_PATH = path.resolve(
  PROJECT_ROOT,
  "config/dom-bridge-replacements.json",
);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const DELETED_DOM_PATTERNS = [
  /\bMutationObserver\b/,
  /\bdocument\.(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|createElement)\b/,
  /\.(?:appendChild|append|prepend|insertBefore|replaceWith|insertAdjacentElement|insertAdjacentHTML)\s*\(/,
  /\.(?:innerHTML|outerHTML)\s*=/,
  /\.classList\.(?:add|remove|replace|toggle)\s*\(/,
  /\.style\.[A-Za-z_$][\w$]*\s*=/,
];

function parseArguments(argv) {
  const args = { changedFrom: null };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--changed-from") {
      args.changedFrom = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    throw new Error(`Unknown replacement-audit argument: ${value}`);
  }

  return args;
}

function normaliseRepoPath(value) {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function absolutePath(repoPath) {
  return path.resolve(PROJECT_ROOT, repoPath);
}

async function fileExists(repoPath) {
  try {
    await access(absolutePath(repoPath));
    return true;
  } catch {
    return false;
  }
}

function isSourceFile(repoPath) {
  return (
    repoPath.startsWith("src/") &&
    SOURCE_EXTENSIONS.has(path.extname(repoPath))
  );
}

async function loadManifest() {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read config/dom-bridge-replacements.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || !Array.isArray(parsed.replacements)) {
    throw new Error(
      'config/dom-bridge-replacements.json must contain a "replacements" array.',
    );
  }

  return parsed.replacements;
}

function validateManifestShape(replacements) {
  const errors = [];
  const ids = new Set();
  const removedPaths = new Set();

  for (const replacement of replacements) {
    const id = String(replacement?.id ?? "").trim();
    if (!id) {
      errors.push("A DOM replacement contract is missing an id.");
      continue;
    }
    if (ids.has(id)) errors.push(`Duplicate DOM replacement id: ${id}`);
    ids.add(id);

    if (
      !Array.isArray(replacement.responsibilities) ||
      replacement.responsibilities.length === 0 ||
      replacement.responsibilities.some(
        (item) => typeof item !== "string" || !item.trim(),
      )
    ) {
      errors.push(`${id}: responsibilities must be a non-empty string array.`);
    }

    if (
      !Array.isArray(replacement.removedPaths) ||
      replacement.removedPaths.length === 0
    ) {
      errors.push(`${id}: removedPaths must contain at least one retired source path.`);
    } else {
      for (const rawPath of replacement.removedPaths) {
        const repoPath = normaliseRepoPath(rawPath);
        if (!isSourceFile(repoPath)) {
          errors.push(`${id}: invalid removed source path ${repoPath}.`);
          continue;
        }
        if (removedPaths.has(repoPath)) {
          errors.push(`Removed bridge path is registered more than once: ${repoPath}`);
        }
        removedPaths.add(repoPath);
      }
    }

    if (!Array.isArray(replacement.checks) || replacement.checks.length === 0) {
      errors.push(`${id}: checks must contain at least one native replacement check.`);
      continue;
    }

    for (const check of replacement.checks) {
      const repoPath = normaliseRepoPath(check?.path);
      if (!isSourceFile(repoPath)) {
        errors.push(`${id}: invalid replacement check path ${repoPath}.`);
      }
      if (
        !Array.isArray(check?.contains) ||
        check.contains.length === 0 ||
        check.contains.some((item) => typeof item !== "string" || !item)
      ) {
        errors.push(`${id}: ${repoPath} must define a non-empty contains array.`);
      }
      if (
        check?.notContains !== undefined &&
        (!Array.isArray(check.notContains) ||
          check.notContains.some((item) => typeof item !== "string" || !item))
      ) {
        errors.push(`${id}: ${repoPath} has an invalid notContains array.`);
      }
    }
  }

  return { errors, removedPaths };
}

async function verifyContracts(replacements) {
  const errors = [];

  for (const replacement of replacements) {
    const id = replacement.id;

    for (const rawPath of replacement.removedPaths) {
      const repoPath = normaliseRepoPath(rawPath);
      if (await fileExists(repoPath)) {
        errors.push(
          `${id}: retired bridge still exists at ${repoPath}. Delete it only after its native replacement is in place.`,
        );
      }
    }

    for (const check of replacement.checks) {
      const repoPath = normaliseRepoPath(check.path);
      if (!(await fileExists(repoPath))) {
        errors.push(`${id}: native replacement file is missing: ${repoPath}.`);
        continue;
      }

      const content = await readFile(absolutePath(repoPath), "utf8");
      for (const expected of check.contains) {
        if (!content.includes(expected)) {
          errors.push(
            `${id}: ${repoPath} no longer contains required replacement marker: ${JSON.stringify(expected)}.`,
          );
        }
      }

      for (const forbidden of check.notContains ?? []) {
        if (content.includes(forbidden)) {
          errors.push(
            `${id}: ${repoPath} contains forbidden legacy marker: ${JSON.stringify(forbidden)}.`,
          );
        }
      }
    }
  }

  return errors;
}

function getDeletedSourceFiles(baseRef) {
  if (!baseRef) return [];

  const attempts = [
    ["diff", "--name-only", "--diff-filter=D", baseRef, "HEAD", "--", "src"],
    ["diff", "--name-only", "--diff-filter=D", "HEAD^", "HEAD", "--", "src"],
  ];

  for (const args of attempts) {
    try {
      const output = execFileSync("git", args, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      return output
        .split(/\r?\n/)
        .map(normaliseRepoPath)
        .filter(isSourceFile);
    } catch {
      // Try the parent fallback below.
    }
  }

  throw new Error(
    `Could not determine deleted source files from ${baseRef}. Ensure the checkout has enough Git history.`,
  );
}

function readBaseFile(baseRef, repoPath) {
  const refs = [baseRef, "HEAD^"];
  for (const ref of refs) {
    if (!ref) continue;
    try {
      return execFileSync("git", ["show", `${ref}:${repoPath}`], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // Try the fallback ref.
    }
  }
  return "";
}

function isBridgeDeletion(repoPath, previousContent) {
  if (/Bridge\.(?:js|jsx|ts|tsx)$/i.test(path.basename(repoPath))) return true;
  return DELETED_DOM_PATTERNS.some((pattern) => pattern.test(previousContent));
}

function verifyDeletedFilesAreRegistered(baseRef, registeredRemovedPaths) {
  if (!baseRef) return [];

  const errors = [];
  for (const repoPath of getDeletedSourceFiles(baseRef)) {
    const previousContent = readBaseFile(baseRef, repoPath);
    if (!isBridgeDeletion(repoPath, previousContent)) continue;
    if (registeredRemovedPaths.has(repoPath)) continue;

    errors.push(
      `Deleted DOM/bridge source is not covered by a replacement contract: ${repoPath}. Record its old responsibilities and native replacement checks in config/dom-bridge-replacements.json before deleting it.`,
    );
  }

  return errors;
}

const args = parseArguments(process.argv.slice(2));
const replacements = await loadManifest();
const { errors: shapeErrors, removedPaths } = validateManifestShape(replacements);
const contractErrors = shapeErrors.length ? [] : await verifyContracts(replacements);
const deletionErrors = shapeErrors.length
  ? []
  : verifyDeletedFilesAreRegistered(args.changedFrom, removedPaths);
const errors = [...shapeErrors, ...contractErrors, ...deletionErrors];

console.log(
  `DOM replacement audit checked ${replacements.length} replacement contract${replacements.length === 1 ? "" : "s"}.`,
);

if (errors.length > 0) {
  console.error(`\nDOM replacement policy failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "\nA bridge is only complete when every recorded responsibility has a native owner and the replacement checks still pass.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "All recorded DOM bridge responsibilities still have their required native replacements.",
  );
}
