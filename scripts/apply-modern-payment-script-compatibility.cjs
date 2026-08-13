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

  // The admin-only override patch runs earlier in prebuild and has already
  // wrapped the existing fee field by the time the cap patch executes. Teach
  // the cap patch to accept either the original field or that admin-only form.
  patchFile(
    feeCapScriptPath,
    'editPage = replaceRequired(editPage, oldFeeBlock, newFeeBlock, "admin fee settings block");',
    [
      "const priorAdminFeeBlock = [",
      '  "          {access.isAdmin ? (",',
      '  "            <div>",',
      '  "              <p className=\\\"text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45\\\">",',
      '  "                Match fee setting · Admin only",',
      '  "              </p>",',
      '  "              <div className=\\\"mt-4 grid gap-4 md:grid-cols-2\\\">",',
      '  "                <Field",',
      '  "                  label=\\\"Player fee override\\\"",',
      '  "                  name=\\\"playerMatchFeeOverride\\\"",',
      '  "                  type=\\\"number\\\"",',
      '  "                  defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}",',
      '  "                  placeholder=\\\"Leave blank to use the team default\\\"",',
      '  "                  help=\\\"Admin-only setting. Use 0 for a free player. Every change is recorded in the audit log.\\\"",',
      '  "                />",',
      '  "              </div>",',
      '  "            </div>",',
      '  "          ) : null}",',
      '].join("\\n");',
      "editPage = replaceRequired(",
      "  editPage,",
      "  editPage.includes(oldFeeBlock) ? oldFeeBlock : priorAdminFeeBlock,",
      "  newFeeBlock,",
      '  "admin fee settings block",',
      ");",
    ].join("\n"),
    "player match-fee cap admin field compatibility",
  );
}

console.log(
  "Made legacy squad-payment build patches compatible with the modern captain page.",
);
