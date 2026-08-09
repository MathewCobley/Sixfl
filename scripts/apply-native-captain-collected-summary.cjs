const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

function replaceBetweenRequired(startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return;

  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) {
    throw new Error(`Expected ${label} source was not found in squad payments.`);
  }

  source = source.slice(0, start) + replacement + source.slice(end);
}

function insertBeforeRequired(marker, block, appliedMarker, label) {
  if (source.includes(appliedMarker)) return;

  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`Expected ${label} source was not found in squad payments.`);
  }

  source = source.slice(0, index) + block + source.slice(index);
}

function replaceTextRequired(before, after, appliedMarker, label) {
  if (source.includes(appliedMarker)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in squad payments.`);
  }
  source = source.replace(before, after);
}

replaceBetweenRequired(
  "function isCaptainCollected(note?: string | null) {",
  "\n\nfunction statusLabel",
  [
    "function isCaptainCollected(note?: string | null) {",
    '  const normalised = note?.toLowerCase() ?? "";',
    "  return (",
    '    normalised.includes("captain/organiser marked") ||',
    '    normalised.includes("paid captain directly: captain collected")',
    "  );",
    "}",
  ].join("\n"),
  "captain-collected note recognition",
);

insertBeforeRequired(
  "  const playerAllocationPence = selectedFees.reduce(",
  [
    "  const captainCollectedFees = selectedFees.filter((fee) =>",
    "    isCaptainCollected(fee.note),",
    "  );",
    "  const captainCollectedPence = captainCollectedFees.reduce(",
    "    (sum, fee) => sum + fee.amountPence,",
    "    0,",
    "  );",
    "  const captainCollectedPlayerCount = captainCollectedFees.length;",
  ].join("\n") + "\n",
  "const captainCollectedPence =",
  "captain-collected totals",
);

replaceTextRequired(
  "Players have paid ${formatMoney(collectedPence)} and ${formatMoney(playerOutstandingPence)}",
  "Players have paid ${formatMoney(collectedPence)} through SIXFL and ${formatMoney(playerOutstandingPence)}",
  "Players have paid ${formatMoney(collectedPence)} through SIXFL",
  "native summary paid-through-SIXFL wording",
);

const summaryParagraph =
  '        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{summaryText}</p>';
insertBeforeRequired(
  `${summaryParagraph}\n`,
  [
    summaryParagraph,
    "        {captainCollectedPence > 0 ? (",
    '          <div className="mt-3 max-w-4xl rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50/85">',
    '            <span className="font-semibold text-cyan-50">',
    "              Paid directly to captain: {formatMoney(captainCollectedPence)} from{\" \"}",
    "              {captainCollectedPlayerCount} player",
    '              {captainCollectedPlayerCount === 1 ? "" : "s"}.',
    "            </span>{\" \"}",
    "            This is recorded separately from SIXFL player-link payments. Any amount the",
    "            captain passes on to SIXFL is reflected in the team balance shown above.",
    "          </div>",
    "        ) : null}",
  ].join("\n") + "\n",
  "Paid directly to captain:",
  "native captain-collected summary panel",
);

if (
  !source.includes('normalised.includes("paid captain directly: captain collected")') ||
  !source.includes("captainCollectedPence") ||
  !source.includes("Paid directly to captain:") ||
  !source.includes("captain passes on to SIXFL") ||
  !source.includes("Players have paid ${formatMoney(collectedPence)} through SIXFL")
) {
  throw new Error("Native captain-collected payment summary was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Squad payments now show captain-collected player money natively in the server-rendered summary.",
);
