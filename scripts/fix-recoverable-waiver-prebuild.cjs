const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(process.cwd(), relativePath), source, "utf8");
}

// Repair nested template-literal interpolation in the late-player waiver patch.
{
  const relativePath = "scripts/apply-late-player-payment-waiver-recovery.cjs";
  let source = read(relativePath);
  const overEscaped = "\\\\${";
  const correctlyEscaped = "\\${";
  const count = source.split(overEscaped).length - 1;
  if (count > 0) {
    source = source.replaceAll(overEscaped, correctlyEscaped);
    write(relativePath, source);
  }
  if (source.includes(overEscaped)) {
    throw new Error("Late-player waiver interpolation repair did not complete.");
  }
}

// The player-payment page is changed by earlier production-preparation scripts,
// so make the waiver UI patch anchor on the stable balance declaration rather
// than an exact two-line block that can legitimately evolve.
{
  const relativePath = "scripts/apply-waiver-payment-ui-consistency.cjs";
  let source = read(relativePath);
  const oldBlock = `playerCollection = replaceRequired(\n  playerCollection,\n  \`  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;\`,\n  \`  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\\n  const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;\`,\n  \"captain player collection waiver amount\",\n);`;
  const flexibleBlock = `if (!playerCollection.includes(\"const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\")) {\n  const balanceAnchor = \"  const stillToCoverPence =\";\n  if (!playerCollection.includes(balanceAnchor)) {\n    throw new Error(\"Expected captain player collection balance declaration was not found.\");\n  }\n  playerCollection = playerCollection.replace(\n    balanceAnchor,\n    \"  const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\\n\" + balanceAnchor,\n  );\n}`;

  if (source.includes(oldBlock)) {
    source = source.replace(oldBlock, flexibleBlock);
    write(relativePath, source);
  }

  if (source.includes("captain player collection waiver amount")) {
    throw new Error("Recoverable waiver UI compatibility patch did not replace the brittle anchor.");
  }
}

console.log("Recoverable waiver prebuild compatibility fixes applied.");
