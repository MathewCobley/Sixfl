const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "src/lib/players/player-account-merge.ts",
);
let source = fs.readFileSync(target, "utf8");

const candidatesBefore = `  const candidates = (
    await Promise.all(candidateRows.map((row) => loadAccountSummary(row.id)))
  ).filter((value): value is PlayerMergeAccountSummary => Boolean(value));`;
const candidatesAfter = `  const candidates = (
    await Promise.all(candidateRows.map((row) => loadAccountSummary(row.id)))
  )
    .filter((value): value is PlayerMergeAccountSummary => Boolean(value))
    .filter((candidate) => {
      const candidateNameKey = normalizeName(candidate.name);
      return Boolean(
        normalizedName &&
          candidateNameKey &&
          candidateNameKey === normalizedName,
      );
    });`;

if (!source.includes(candidatesAfter)) {
  if (!source.includes(candidatesBefore)) {
    throw new Error("Player merge candidate list was not found.");
  }
  source = source.replace(candidatesBefore, candidatesAfter);
}

const message =
  "Player account merges require matching player names. A shared email address or mobile number is contact information only and cannot prove that two differently named people are the same player.";

if (!source.includes(message)) {
  const marker = "    const keptEmailKey = normalizeEmail(keptUser.email);";
  const replacement = `    if (
      keptNameKey &&
      mergedNameKey &&
      keptNameKey !== mergedNameKey
    ) {
      throw new PlayerMergeConflictError(
        "${message}",
      );
    }

${marker}`;

  if (!source.includes(marker)) {
    throw new Error(
      "The shared-email merge guard must run before the matching-name merge guard.",
    );
  }
  source = source.replace(marker, replacement);
}

fs.writeFileSync(target, source, "utf8");

if (
  !source.includes(message) ||
  !source.includes("candidateNameKey === normalizedName")
) {
  throw new Error("Player account merge name safety was not applied.");
}

console.log(
  "Player accounts can be merged only when the stored player names match; shared contact details alone are never sufficient.",
);
