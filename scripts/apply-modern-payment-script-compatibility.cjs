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

// A later player-fee-cap patch was added after this compatibility layer. It must
// compose with the admin-only player-fee safeguard which runs earlier in prebuild.
const feeCapScriptPath = "scripts/apply-player-match-fee-cap.cjs";
const feeCapAbsolutePath = path.join(root, feeCapScriptPath);
if (fs.existsSync(feeCapAbsolutePath)) {
  // Repair an unescaped nested template literal in the generated policy text.
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

  // The player edit field is already admin-only by this point in the patch chain.
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

  // Server-side validation is already restricted to admins, so make that the
  // cap patch's expected starting point rather than the older unrestricted form.
  patchFile(
    feeCapScriptPath,
    '  \'  if (Number.isNaN(playerMatchFeeOverride)) {\\n    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank.", access.isAdmin));\\n  }\',',
    '  \'  if (access.isAdmin && Number.isNaN(playerMatchFeeOverride)) {\\n    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank.", access.isAdmin));\\n  }\',',
    "player match-fee cap admin validation compatibility",
  );

  // The admin-only safeguard has also expanded the existing-profile query.
  patchFile(
    feeCapScriptPath,
    '  \'  const existingProfiles = await prisma.$queryRaw<\\n    Array<{ sourceProspectId: string | null }>\\n  >`\\n    SELECT "sourceProspectId"\\n    FROM "TeamMemberProfile"\',',
    '  \'  const existingProfiles = await prisma.$queryRaw<\\n    Array<{\\n      sourceProspectId: string | null;\\n      playerMatchFeePenceOverride: number | null;\\n    }>\\n  >`\\n    SELECT "sourceProspectId", "playerMatchFeePenceOverride"\\n    FROM "TeamMemberProfile"\',',
    "player match-fee cap existing profile query compatibility",
  );

  // Preserve the earlier override-audit calculation while adding the cap state.
  patchFile(
    feeCapScriptPath,
    '  \'  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;\\n\\n  await prisma.$transaction(async (tx) => {\',',
    '  \'  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;\\n  const existingPlayerMatchFeeOverride =\\n    existingProfiles[0]?.playerMatchFeePenceOverride ?? null;\\n  const nextPlayerMatchFeeOverride = access.isAdmin\\n    ? playerMatchFeeOverride\\n    : existingPlayerMatchFeeOverride;\\n  const playerMatchFeeOverrideChanged =\\n    access.isAdmin &&\\n    existingPlayerMatchFeeOverride !== nextPlayerMatchFeeOverride;\\n\\n  await prisma.$transaction(async (tx) => {\',',
    "player match-fee cap protected settings compatibility",
  );

  patchFile(
    feeCapScriptPath,
    '  const nextPlayerMatchFeeCap = access.isAdmin\\n    ? playerMatchFeeCap\\n    : existingPlayerMatchFeeCap;\\n\\n  await prisma.$transaction(async (tx) => {',
    '  const nextPlayerMatchFeeCap = access.isAdmin\\n    ? playerMatchFeeCap\\n    : existingPlayerMatchFeeCap;\\n  const playerMatchFeeOverrideChanged =\\n    access.isAdmin &&\\n    existingPlayerMatchFeeOverride !== nextPlayerMatchFeeOverride;\\n\\n  await prisma.$transaction(async (tx) => {',
    "player match-fee cap audit preservation",
  );

  // The earlier safeguard already renamed this persisted value to the protected
  // next-value variable; the cap patch should extend it rather than look for the old one.
  patchFile(
    feeCapScriptPath,
    '  \'        ${phone},\\n        ${playerMatchFeeOverride},\\n        ${preferredPositions},\',',
    '  \'        ${phone},\\n        ${nextPlayerMatchFeeOverride},\\n        ${preferredPositions},\',',
    "player match-fee cap protected insert compatibility",
  );
}

console.log(
  "Made legacy squad-payment build patches compatible with the modern captain page.",
);
