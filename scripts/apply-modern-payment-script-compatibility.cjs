const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, before, after, label) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }

  source = source.replace(before, after);
  fs.writeFileSync(absolutePath, source, "utf8");
}

patchFile(
  "scripts/apply-captain-player-payment-team-fee-fix.cjs",
  [
    "  if (!source.includes(before)) {",
    "    throw new Error(`Expected captain squad payment source was not found in ${filePath}`);",
    "  }",
  ].join("\n"),
  [
    "  if (!source.includes(before)) {",
    "    if (",
    '      filePath.endsWith("PaymentPageServer.tsx") &&',
    '      source.includes("What is happening with this fixture?")',
    "    ) {",
    "      return;",
    "    }",
    "    throw new Error(`Expected captain squad payment source was not found in ${filePath}`);",
    "  }",
  ].join("\n"),
  "modern team-fee page compatibility",
);

patchFile(
  "scripts/apply-captain-player-payment-safety-guard.cjs",
  [
    "  if (!source.includes(before)) {",
    "    throw new Error(`Expected ${label} source was not found in ${filePath}`);",
    "  }",
  ].join("\n"),
  [
    "  if (!source.includes(before)) {",
    "    if (",
    '      filePath.endsWith("PaymentPageServer.tsx") &&',
    '      source.includes("What is happening with this fixture?")',
    "    ) {",
    "      return;",
    "    }",
    "    throw new Error(`Expected ${label} source was not found in ${filePath}`);",
    "  }",
  ].join("\n"),
  "modern payment-safety page compatibility",
);

patchFile(
  "scripts/apply-positive-fee-team-credit-policy.cjs",
  [
    "    if (!source.includes(before)) {",
    "      throw new Error(`Expected ${label} source was not found in ${filePath}`);",
    "    }",
  ].join("\n"),
  [
    "    if (!source.includes(before)) {",
    "      if (",
    '        filePath.endsWith("PaymentPageServer.tsx") &&',
    '        source.includes("What is happening with this fixture?")',
    "      ) {",
    "        continue;",
    "      }",
    "      throw new Error(`Expected ${label} source was not found in ${filePath}`);",
    "    }",
  ].join("\n"),
  "modern team-credit page compatibility",
);

// A later player-fee-cap patch was added after this compatibility layer. Its
// generated TypeScript policy was wrapped in a JavaScript template literal but
// also contained an unescaped nested template literal, so Node could not parse
// the build script at all. Repair the generated line before that script runs.
const feeCapScriptPath = "scripts/apply-player-match-fee-cap.cjs";
const feeCapAbsolutePath = path.join(root, feeCapScriptPath);
if (fs.existsSync(feeCapAbsolutePath)) {
  patchFile(
    feeCapScriptPath,
    [
      "    const capNote = cappedPlayer\\n",
      '      ? `${PLAYER_FEE_CAP_NOTE}: captain share ${formatMoney(enteredAmountPence)}; player charged ${formatMoney(payableAmountPence)}.`\\n',
      "      : null;\\n",
    ].join(""),
    [
      "    const capNote = cappedPlayer\\n",
      '      ? PLAYER_FEE_CAP_NOTE + ": captain share " + formatMoney(enteredAmountPence) + "; player charged " + formatMoney(payableAmountPence) + "."\\n',
      "      : null;\\n",
    ].join(""),
    "player match-fee cap generated note syntax",
  );
}

console.log(
  "Made legacy squad-payment build patches compatible with the modern captain page.",
);
