const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/components/captain/TeamAutoPayCopyBridge.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  "function updateSelectedSummary(input: {\n  cancelled: boolean;\n  awaitingLabel: string | null;\n}) {",
  [
    "function getSelectedOpenPlayerCount() {",
    "  const labels = Array.from(document.querySelectorAll<HTMLElement>(\"p\"));",
    "  const awaitingLabel = labels.find(",
    "    (element) => element.textContent?.trim() === \"Awaiting from players\",",
    "  );",
    "  const metricCard = awaitingLabel?.closest<HTMLElement>(\"div.rounded-3xl\") ?? null;",
    "  const helper = metricCard",
    "    ? Array.from(metricCard.querySelectorAll<HTMLParagraphElement>(\"p\")).at(-1)",
    "    : null;",
    "  const match = helper?.textContent?.trim().match(/^(\\d+)\\s+open payment request/i);",
    "  if (!match) return null;",
    "  const count = Number(match[1]);",
    "  return Number.isInteger(count) ? count : null;",
    "}",
    "",
    "function updateSelectedSummary(input: {",
    "  cancelled: boolean;",
    "  awaitingLabel: string | null;",
    "  awaitingCount: number | null;",
    "}) {",
  ].join("\n"),
  "open-player count helper and summary signature",
);

replaceRequired(
  [
    "  if (input.awaitingLabel) {",
    "    setText(",
    "      heading,",
    "      `Fixture fee covered — ${input.awaitingLabel} still to collect from a player.`,",
    "    );",
    "    setText(",
    "      description,",
    "      `The SIXFL fixture fee is already covered, but a player payment request for ${input.awaitingLabel} is still open. When it is paid, the excess will be added to the team credit pot.`,",
    "    );",
    "    setSummaryTone(section, \"amber\");",
    "  }",
  ].join("\n"),
  [
    "  if (input.awaitingLabel) {",
    "    const playerLabel =",
    "      input.awaitingCount === 1",
    "        ? \"1 player\"",
    "        : input.awaitingCount && input.awaitingCount > 1",
    "          ? `${input.awaitingCount} players`",
    "          : \"players\";",
    "    const detail =",
    "      input.awaitingCount === 1",
    "        ? `The SIXFL fixture fee is already covered, but one player payment request for ${input.awaitingLabel} is still open. When it is paid, the excess will be added to the team credit pot.`",
    "        : input.awaitingCount && input.awaitingCount > 1",
    "          ? `The SIXFL fixture fee is already covered, but ${input.awaitingCount} player payment requests totalling ${input.awaitingLabel} are still open. When they are paid, the excess will be added to the team credit pot.`",
    "          : `The SIXFL fixture fee is already covered, but player payment requests totalling ${input.awaitingLabel} remain open. Any excess received will be added to the team credit pot.`;",
    "",
    "    setText(",
    "      heading,",
    "      `Fixture fee covered — ${input.awaitingLabel} still to collect from ${playerLabel}.`,",
    "    );",
    "    setText(description, detail);",
    "    setSummaryTone(section, \"amber\");",
    "  }",
  ].join("\n"),
  "count-aware covered-fixture summary",
);

replaceRequired(
  "        updateSelectedSummary({ cancelled: true, awaitingLabel: null });",
  "        updateSelectedSummary({ cancelled: true, awaitingLabel: null, awaitingCount: null });",
  "cancelled summary call",
);

replaceRequired(
  "        updateSelectedSummary({ cancelled: false, awaitingLabel });",
  [
    "        updateSelectedSummary({",
    "          cancelled: false,",
    "          awaitingLabel,",
    "          awaitingCount: getSelectedOpenPlayerCount(),",
    "        });",
  ].join("\n"),
  "open-player summary call",
);

fs.writeFileSync(filePath, source, "utf8");

if (
  source.includes("still to collect from a player") ||
  !source.includes("getSelectedOpenPlayerCount") ||
  !source.includes("player payment requests totalling")
) {
  throw new Error("Player-payment summary pluralisation was not applied correctly.");
}

console.log("Player-payment summaries now use the actual number of unpaid players.");
