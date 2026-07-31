const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "night-board",
  "page.tsx",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Night Board page not found.");
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

function replaceOnce(before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error("Expected Night Board fee-audit source was not found.");
  }
  source = source.replace(before, after);
  changed = true;
}

replaceOnce(
  `function getTeamChargeSummary(\n  fixture: FixtureForBoard,\n  teamId: string,\n): TeamChargeSummary {`,
  `function getTeamChargeSummary(\n  fixture: FixtureForBoard,\n  teamId: string,\n  expectedPence: number,\n): TeamChargeSummary {`,
);

replaceOnce(
  `  if (charges.length === 0) {\n    const expectedPence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n    return {\n      amountPence: expectedPence,\n      paidPence: 0,\n      outstandingPence: expectedPence,\n      label: "Missing charge",\n      detail: \`Expected \${formatMoney(expectedPence)}\`,\n      tone: "missing",\n    };\n  }`,
  `  if (charges.length === 0) {\n    if (expectedPence <= 0) {\n      return {\n        amountPence: 0,\n        paidPence: 0,\n        outstandingPence: 0,\n        label: "No charge expected",\n        detail: "Configured fixture fee £0.00",\n        tone: "paid",\n      };\n    }\n\n    return {\n      amountPence: expectedPence,\n      paidPence: 0,\n      outstandingPence: expectedPence,\n      label: "Missing charge",\n      detail: \`Configured fixture fee \${formatMoney(expectedPence)}\`,\n      tone: "missing",\n    };\n  }`,
);

replaceOnce(
  `      status: true,\n      matchFeePence: true,\n      league: {`,
  `      status: true,\n      matchFeePence: true,\n      homeMatchFeePence: true,\n      awayMatchFeePence: true,\n      league: {`,
);

replaceOnce(
  `  const homeCharge = getTeamChargeSummary(fixture, fixture.homeTeam.id);\n  const awayCharge = getTeamChargeSummary(fixture, fixture.awayTeam.id);`,
  `  const homeCharge = getTeamChargeSummary(\n    fixture,\n    fixture.homeTeam.id,\n    fixture.homeMatchFeePence ??\n      fixture.matchFeePence ??\n      DEFAULT_MATCH_FEE_PENCE,\n  );\n  const awayCharge = getTeamChargeSummary(\n    fixture,\n    fixture.awayTeam.id,\n    fixture.awayMatchFeePence ??\n      fixture.matchFeePence ??\n      DEFAULT_MATCH_FEE_PENCE,\n  );`,
);

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("Applied Night Board team-specific fee audit fix.");
} else {
  console.log("Night Board team-specific fee audit fix already applied.");
}
