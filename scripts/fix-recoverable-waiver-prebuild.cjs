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

// Earlier production-preparation scripts evolve both payment pages before the
// recoverable-waiver UI patch runs. Replace its brittle exact-block anchors with
// stable declaration anchors while retaining its final feature contract.
{
  const relativePath = "scripts/apply-waiver-payment-ui-consistency.cjs";
  let source = read(relativePath);

  const oldPlayerBlock = `playerCollection = replaceRequired(\n  playerCollection,\n  \`  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;\`,\n  \`  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;\\n  const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\\n  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;\`,\n  \"captain player collection waiver amount\",\n);`;
  const flexiblePlayerBlock = `if (!playerCollection.includes(\"const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\")) {\n  const balanceAnchor = \"  const stillToCoverPence =\";\n  if (!playerCollection.includes(balanceAnchor)) {\n    throw new Error(\"Expected captain player collection balance declaration was not found.\");\n  }\n  playerCollection = playerCollection.replace(\n    balanceAnchor,\n    \"  const sixflWaivedPence = selectedEntry?.waivedPence ?? 0;\\n\" + balanceAnchor,\n  );\n}`;
  if (source.includes(oldPlayerBlock)) {
    source = source.replace(oldPlayerBlock, flexiblePlayerBlock);
  }

  const oldLateFeeBlock = `lateFeePage = replaceRequired(\n  lateFeePage,\n  \`  const auditItems = getPaymentLateFeeAuditItems(row);\\n\\n  return (\`,\n  \`  const auditItems = getPaymentLateFeeAuditItems(row);\\n  const debtWaivedPence = getTeamChargeWaivedPence(row.description);\\n  const netOutstandingPence = Math.max(row.outstandingPence - debtWaivedPence, 0);\\n  const displayDescription = stripTeamChargeWaiverMarkers(row.description);\\n\\n  return (\`,\n  \"late fee card waiver values\",\n);`;
  const flexibleLateFeeBlock = `if (!lateFeePage.includes(\"const netOutstandingPence = Math.max(row.outstandingPence - debtWaivedPence, 0);\")) {\n  const auditAnchor = \"  const auditItems = getPaymentLateFeeAuditItems(row);\";\n  if (!lateFeePage.includes(auditAnchor)) {\n    throw new Error(\"Expected late fee card audit declaration was not found.\");\n  }\n  lateFeePage = lateFeePage.replace(\n    auditAnchor,\n    auditAnchor + \"\\n  const debtWaivedPence = getTeamChargeWaivedPence(row.description);\\n  const netOutstandingPence = Math.max(row.outstandingPence - debtWaivedPence, 0);\\n  const displayDescription = stripTeamChargeWaiverMarkers(row.description);\",\n  );\n}`;
  if (source.includes(oldLateFeeBlock)) {
    source = source.replace(oldLateFeeBlock, flexibleLateFeeBlock);
  }

  write(relativePath, source);

  if (
    source.includes("captain player collection waiver amount") ||
    source.includes("late fee card waiver values")
  ) {
    throw new Error("Recoverable waiver UI compatibility patch did not replace all brittle anchors.");
  }
}

console.log("Recoverable waiver prebuild compatibility fixes applied.");
