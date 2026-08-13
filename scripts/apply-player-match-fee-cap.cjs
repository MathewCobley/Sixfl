const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const profilePath = "src/lib/teamMemberProfiles.ts";
const editPagePath = "src/app/captain/team/[teamid]/squad/[membershipId]/edit/page.tsx";
const editActionPath = "src/app/captain/team/[teamid]/squad/edit-actions.ts";
const collectionActionPath = "src/app/captain/team/[teamid]/player-payments/actions.ts";
const collectionPagePath = "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// TeamMemberProfile: add a separate maximum-charge field.
// ---------------------------------------------------------------------------
let profile = read(profilePath);
profile = replaceRequired(
  profile,
  "  playerMatchFeePenceOverride: number | null;\n  createdAt: Date;",
  "  playerMatchFeePenceOverride: number | null;\n  playerMatchFeeCapPence: number | null;\n  createdAt: Date;",
  "profile cap type",
);
profile = replaceRequired(
  profile,
  '      "playerMatchFeePenceOverride" INTEGER,\n      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '      "playerMatchFeePenceOverride" INTEGER,\n      "playerMatchFeeCapPence" INTEGER,\n      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  "profile cap table column",
);
profile = replaceRequired(
  profile,
  '  await client.$executeRawUnsafe(`\n    ALTER TABLE "TeamMemberProfile"\n      ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;\n  `);',
  '  await client.$executeRawUnsafe(`\n    ALTER TABLE "TeamMemberProfile"\n      ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;\n  `);\n\n  await client.$executeRawUnsafe(`\n    ALTER TABLE "TeamMemberProfile"\n      ADD COLUMN IF NOT EXISTS "playerMatchFeeCapPence" INTEGER;\n  `);',
  "profile cap alter",
);
profile = replaceRequired(
  profile,
  '        "playerMatchFeePenceOverride",\n        "createdAt",',
  '        "playerMatchFeePenceOverride",\n        "playerMatchFeeCapPence",\n        "createdAt",',
  "profile cap select",
);
write(profilePath, profile);

// ---------------------------------------------------------------------------
// Player edit page: fee controls are admin-only and include a maximum charge.
// ---------------------------------------------------------------------------
let editPage = read(editPagePath);
editPage = replaceRequired(
  editPage,
  "  await requireCaptain(teamid);",
  "  const access = await requireCaptain(teamid);",
  "player edit access",
);

const oldFeeBlock = `          <div>\n            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">\n              Match fee setting\n            </p>\n            <div className="mt-4 grid gap-4 md:grid-cols-2">\n              <Field\n                label="Player fee override"\n                name="playerMatchFeeOverride"\n                type="number"\n                defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}\n                placeholder="Leave blank to use the team default"\n                help="Use 0 for a free player. Leave blank to use the default amount on the squad payments page."\n              />\n            </div>\n          </div>`;

const newFeeBlock = `          {access.isAdmin ? (\n            <div>\n              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">\n                Match fee settings · Admin only\n              </p>\n              <div className="mt-4 grid gap-4 md:grid-cols-2">\n                <Field\n                  label="Player fee override"\n                  name="playerMatchFeeOverride"\n                  type="number"\n                  defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}\n                  placeholder="Leave blank to use normal player fee"\n                  help="Use 0 for a genuinely free player. Leave blank unless an exact override is required."\n                />\n                <Field\n                  label="Maximum player charge"\n                  name="playerMatchFeeCap"\n                  type="number"\n                  defaultValue={formatFeeOverride(profile?.playerMatchFeeCapPence)}\n                  placeholder="For example 5.00"\n                  help="Sets a ceiling only. If the captain assigns £7 and this is £5, the player is charged £5. If the captain assigns £4, the player is charged £4. Once the capped payment is made, the captain still sees the normal assigned share as settled."\n                />\n              </div>\n            </div>\n          ) : null}`;

editPage = replaceRequired(editPage, oldFeeBlock, newFeeBlock, "admin fee settings block");
write(editPagePath, editPage);

// ---------------------------------------------------------------------------
// Player edit server action: preserve financial settings for non-admins.
// ---------------------------------------------------------------------------
let editAction = read(editActionPath);
editAction = replaceRequired(
  editAction,
  '  const playerMatchFeeOverride = parsePlayerMatchFeeOverride(\n    formData.get("playerMatchFeeOverride"),\n  );\n  const preferredPositions =',
  '  const playerMatchFeeOverride = parsePlayerMatchFeeOverride(\n    formData.get("playerMatchFeeOverride"),\n  );\n  const playerMatchFeeCap = parsePlayerMatchFeeOverride(\n    formData.get("playerMatchFeeCap"),\n  );\n  const preferredPositions =',
  "cap form parsing",
);
editAction = replaceRequired(
  editAction,
  '  if (Number.isNaN(playerMatchFeeOverride)) {\n    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank.", access.isAdmin));\n  }',
  '  if (access.isAdmin && Number.isNaN(playerMatchFeeOverride)) {\n    redirect(getErrorRedirect(teamid, "Player fee override must be a valid amount or left blank.", access.isAdmin));\n  }\n\n  if (access.isAdmin && Number.isNaN(playerMatchFeeCap)) {\n    redirect(getErrorRedirect(teamid, "Maximum player charge must be a valid amount or left blank.", access.isAdmin));\n  }',
  "admin cap validation",
);
editAction = replaceRequired(
  editAction,
  '  const existingProfiles = await prisma.$queryRaw<\n    Array<{ sourceProspectId: string | null }>\n  >`\n    SELECT "sourceProspectId"\n    FROM "TeamMemberProfile"',
  '  await prisma.$executeRawUnsafe(`\n    ALTER TABLE "TeamMemberProfile"\n      ADD COLUMN IF NOT EXISTS "playerMatchFeeCapPence" INTEGER;\n  `);\n\n  const existingProfiles = await prisma.$queryRaw<\n    Array<{\n      sourceProspectId: string | null;\n      playerMatchFeePenceOverride: number | null;\n      playerMatchFeeCapPence: number | null;\n    }>\n  >`\n    SELECT "sourceProspectId", "playerMatchFeePenceOverride", "playerMatchFeeCapPence"\n    FROM "TeamMemberProfile"',
  "existing fee settings query",
);
editAction = replaceRequired(
  editAction,
  '  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;\n\n  await prisma.$transaction(async (tx) => {',
  '  const sourceProspectId = existingProfiles[0]?.sourceProspectId ?? null;\n  const existingPlayerMatchFeeOverride = existingProfiles[0]?.playerMatchFeePenceOverride ?? null;\n  const existingPlayerMatchFeeCap = existingProfiles[0]?.playerMatchFeeCapPence ?? null;\n  const nextPlayerMatchFeeOverride = access.isAdmin\n    ? playerMatchFeeOverride\n    : existingPlayerMatchFeeOverride;\n  const nextPlayerMatchFeeCap = access.isAdmin\n    ? playerMatchFeeCap\n    : existingPlayerMatchFeeCap;\n\n  await prisma.$transaction(async (tx) => {',
  "protected fee settings",
);
editAction = replaceRequired(
  editAction,
  '        "playerMatchFeePenceOverride" INTEGER,\n        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '        "playerMatchFeePenceOverride" INTEGER,\n        "playerMatchFeeCapPence" INTEGER,\n        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  "edit action cap table column",
);
editAction = replaceRequired(
  editAction,
  '    await tx.$executeRawUnsafe(`\n      ALTER TABLE "TeamMemberProfile"\n        ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;\n    `);',
  '    await tx.$executeRawUnsafe(`\n      ALTER TABLE "TeamMemberProfile"\n        ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;\n    `);\n\n    await tx.$executeRawUnsafe(`\n      ALTER TABLE "TeamMemberProfile"\n        ADD COLUMN IF NOT EXISTS "playerMatchFeeCapPence" INTEGER;\n    `);',
  "edit action cap alter",
);
editAction = replaceRequired(
  editAction,
  '        "phone",\n        "playerMatchFeePenceOverride",\n        "preferredPositions",',
  '        "phone",\n        "playerMatchFeePenceOverride",\n        "playerMatchFeeCapPence",\n        "preferredPositions",',
  "cap insert column",
);
editAction = replaceRequired(
  editAction,
  '        ${phone},\n        ${playerMatchFeeOverride},\n        ${preferredPositions},',
  '        ${phone},\n        ${nextPlayerMatchFeeOverride},\n        ${nextPlayerMatchFeeCap},\n        ${preferredPositions},',
  "cap insert value",
);
editAction = replaceRequired(
  editAction,
  '        "playerMatchFeePenceOverride" = EXCLUDED."playerMatchFeePenceOverride",\n        "preferredPositions" = EXCLUDED."preferredPositions",',
  '        "playerMatchFeePenceOverride" = EXCLUDED."playerMatchFeePenceOverride",\n        "playerMatchFeeCapPence" = EXCLUDED."playerMatchFeeCapPence",\n        "preferredPositions" = EXCLUDED."preferredPositions",',
  "cap upsert",
);
write(editActionPath, editAction);

// ---------------------------------------------------------------------------
// Captain player collection: charge the capped amount but retain the captain's
// normal allocated share in a structured note for captain-only presentation.
// ---------------------------------------------------------------------------
let collectionAction = read(collectionActionPath);
collectionAction = replaceRequired(
  collectionAction,
  'const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";',
  'const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";\nconst PLAYER_FEE_CAP_NOTE = "Player fee cap applied";',
  "cap note constant",
);
collectionAction = replaceRequired(
  collectionAction,
  '  ZERO_FEE_WAIVER_NOTE,\n] as const;',
  '  ZERO_FEE_WAIVER_NOTE,\n  PLAYER_FEE_CAP_NOTE,\n] as const;',
  "cap collection note prefix",
);
collectionAction = replaceRequired(
  collectionAction,
  'function getCollectionNote(input: {\n  amountPence: number;\n  method: CaptainCollectionMethod;\n  zeroFeePlayer?: boolean;\n}) {',
  'function getCollectionNote(input: {\n  amountPence: number;\n  method: CaptainCollectionMethod;\n  zeroFeePlayer?: boolean;\n  capNote?: string | null;\n}) {',
  "cap collection note input",
);
collectionAction = replaceRequired(
  collectionAction,
  '  if (input.method === "captain_paid") {',
  '  if (input.capNote && input.method === "link") {\n    return input.capNote;\n  }\n\n  if (input.method === "captain_paid") {',
  "cap collection note output",
);

const oldPlayerPolicy = `    const zeroFeePlayer =\n      player.type === "member" &&\n      profileByMemberId.get(player.id)?.playerMatchFeePenceOverride === 0;\n    const method = getCollectionMethod({\n      formData,\n      type: player.type,\n      id: player.id,\n      amountPence: enteredAmountPence,\n      forceWaived: zeroFeePlayer,\n    });\n    const playerAmountPence = zeroFeePlayer\n      ? enteredAmountPence\n      : method === "waived"\n        ? 0\n        : enteredAmountPence;\n    const nextStatus = getNextStatus(method);\n    const now = new Date();\n    const note = getCollectionNote({\n      amountPence: playerAmountPence,\n      method,\n      zeroFeePlayer,\n    });`;

const newPlayerPolicy = `    const profile =\n      player.type === "member" ? profileByMemberId.get(player.id) ?? null : null;\n    const exactOverride = profile?.playerMatchFeePenceOverride;\n    const hasExactOverride =\n      typeof exactOverride === "number" && Number.isFinite(exactOverride) && exactOverride >= 0;\n    const zeroFeePlayer = hasExactOverride && exactOverride === 0;\n    const capPence = !hasExactOverride ? profile?.playerMatchFeeCapPence : null;\n    const cappedPlayer =\n      typeof capPence === "number" &&\n      Number.isFinite(capPence) &&\n      capPence >= 0 &&\n      enteredAmountPence > capPence;\n    const payableAmountPence = hasExactOverride\n      ? exactOverride\n      : cappedPlayer\n        ? capPence\n        : enteredAmountPence;\n    const method = getCollectionMethod({\n      formData,\n      type: player.type,\n      id: player.id,\n      amountPence: payableAmountPence,\n      forceWaived: zeroFeePlayer,\n    });\n    const playerAmountPence = zeroFeePlayer\n      ? enteredAmountPence\n      : method === "waived"\n        ? 0\n        : payableAmountPence;\n    const nextStatus = getNextStatus(method);\n    const now = new Date();\n    const capNote = cappedPlayer\n      ? `${PLAYER_FEE_CAP_NOTE}: captain share ${formatMoney(enteredAmountPence)}; player charged ${formatMoney(payableAmountPence)}.`\n      : null;\n    const note = getCollectionNote({\n      amountPence: playerAmountPence,\n      method,\n      zeroFeePlayer,\n      capNote,\n    });`;

collectionAction = replaceRequired(
  collectionAction,
  oldPlayerPolicy,
  newPlayerPolicy,
  "player cap policy",
);
write(collectionActionPath, collectionAction);

// ---------------------------------------------------------------------------
// Captain collection page: capped fees show the normal captain allocation,
// while the underlying paid/open amounts remain the real amounts owed to SIXFL.
// ---------------------------------------------------------------------------
let collectionPage = read(collectionPagePath);
collectionPage = replaceRequired(
  collectionPage,
  'const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";',
  'const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";\nconst PLAYER_FEE_CAP_NOTE = "Player fee cap applied";',
  "cap page note constant",
);
collectionPage = replaceRequired(
  collectionPage,
  'function isZeroFeeCaptainSettled(status?: string | null, note?: string | null) {\n  return status === "WAIVED" && Boolean(note?.includes(ZERO_FEE_WAIVER_NOTE));\n}\n\nfunction statusLabel',
  `function isZeroFeeCaptainSettled(status?: string | null, note?: string | null) {\n  return status === "WAIVED" && Boolean(note?.includes(ZERO_FEE_WAIVER_NOTE));\n}\n\nfunction getCaptainAllocatedAmountPence(amountPence: number, note?: string | null) {\n  const match = /Player fee cap applied: captain share £([0-9,.]+); player charged £([0-9,.]+)\\./i.exec(\n    note ?? "",\n  );\n  if (!match) return amountPence;\n\n  const captainAmount = Number(match[1].replace(/,/g, ""));\n  if (!Number.isFinite(captainAmount) || captainAmount < 0) return amountPence;\n  return Math.round(captainAmount * 100);\n}\n\nfunction getCaptainCapBoostPence(input: {\n  amountPence: number;\n  note?: string | null;\n}) {\n  return Math.max(\n    getCaptainAllocatedAmountPence(input.amountPence, input.note) - input.amountPence,\n    0,\n  );\n}\n\nfunction statusLabel`,
  "cap page helpers",
);

const oldFixtureBoost = `  const zeroFeeSettledPenceByFixture = new Map<string, number>();\n  for (const fee of fees) {\n    if (!isZeroFeeCaptainSettled(fee.status, fee.note)) continue;\n    zeroFeeSettledPenceByFixture.set(\n      fee.fixtureId,\n      (zeroFeeSettledPenceByFixture.get(fee.fixtureId) ?? 0) + fee.amountPence,\n    );\n  }`;

const newFixtureBoost = `  const captainSettledBoostPenceByFixture = new Map<string, number>();\n  const captainOpenBoostPenceByFixture = new Map<string, number>();\n  for (const fee of fees) {\n    if (isZeroFeeCaptainSettled(fee.status, fee.note)) {\n      captainSettledBoostPenceByFixture.set(\n        fee.fixtureId,\n        (captainSettledBoostPenceByFixture.get(fee.fixtureId) ?? 0) + fee.amountPence,\n      );\n    }\n\n    const capBoostPence = getCaptainCapBoostPence({\n      amountPence: fee.amountPence,\n      note: fee.note,\n    });\n    if (capBoostPence <= 0) continue;\n\n    if (fee.status === "PAID") {\n      captainSettledBoostPenceByFixture.set(\n        fee.fixtureId,\n        (captainSettledBoostPenceByFixture.get(fee.fixtureId) ?? 0) + capBoostPence,\n      );\n    } else if (fee.status === "OPEN") {\n      captainOpenBoostPenceByFixture.set(\n        fee.fixtureId,\n        (captainOpenBoostPenceByFixture.get(fee.fixtureId) ?? 0) + capBoostPence,\n      );\n    }\n  }`;

collectionPage = replaceRequired(
  collectionPage,
  oldFixtureBoost,
  newFixtureBoost,
  "fixture cap boosts",
);
collectionPage = replaceRequired(
  collectionPage,
  '  const playerAllocationPence = selectedFees.reduce(\n    (sum, fee) => sum + fee.amountPence,\n    0,\n  );\n  const zeroFeeSettledPence = selectedFees.reduce(\n    (sum, fee) =>\n      sum + (isZeroFeeCaptainSettled(fee.status, fee.note) ? fee.amountPence : 0),\n    0,\n  );',
  '  const playerAllocationPence = selectedFees.reduce(\n    (sum, fee) =>\n      sum + getCaptainAllocatedAmountPence(fee.amountPence, fee.note),\n    0,\n  );\n  const captainSettledBoostPence = selectedFees.reduce((sum, fee) => {\n    if (isZeroFeeCaptainSettled(fee.status, fee.note)) {\n      return sum + fee.amountPence;\n    }\n    if (fee.status !== "PAID") return sum;\n    return sum + getCaptainCapBoostPence({ amountPence: fee.amountPence, note: fee.note });\n  }, 0);\n  const captainOpenBoostPence = selectedFees.reduce((sum, fee) => {\n    if (fee.status !== "OPEN") return sum;\n    return sum + getCaptainCapBoostPence({ amountPence: fee.amountPence, note: fee.note });\n  }, 0);',
  "selected cap totals",
);
collectionPage = replaceRequired(
  collectionPage,
  '  const captainSettledPence = collectedPence + zeroFeeSettledPence;\n  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;',
  '  const captainSettledPence = collectedPence + captainSettledBoostPence;\n  const playerOutstandingPence =\n    (selectedEntry?.playerOpenPence ?? 0) + captainOpenBoostPence;',
  "selected cap settled/open",
);

const oldFixtureDisplay = `              const zeroFeeSettledPence = entry.fixtureId\n                ? zeroFeeSettledPenceByFixture.get(entry.fixtureId) ?? 0\n                : 0;\n              const captainPlayerPaidPence = entry.playerPaidPence + zeroFeeSettledPence;\n              const hasCollection = captainPlayerPaidPence > 0 || entry.playerOpenPence > 0;`;

const newFixtureDisplay = `              const settledBoostPence = entry.fixtureId\n                ? captainSettledBoostPenceByFixture.get(entry.fixtureId) ?? 0\n                : 0;\n              const openBoostPence = entry.fixtureId\n                ? captainOpenBoostPenceByFixture.get(entry.fixtureId) ?? 0\n                : 0;\n              const captainPlayerPaidPence = entry.playerPaidPence + settledBoostPence;\n              const captainPlayerOpenPence = entry.playerOpenPence + openBoostPence;\n              const hasCollection = captainPlayerPaidPence > 0 || captainPlayerOpenPence > 0;`;

collectionPage = replaceRequired(
  collectionPage,
  oldFixtureDisplay,
  newFixtureDisplay,
  "fixture cap display",
);
collectionPage = replaceRequired(
  collectionPage,
  '{formatMoney(entry.playerOpenPence)}',
  '{formatMoney(captainPlayerOpenPence)}',
  "fixture capped open display",
);
collectionPage = replaceRequired(
  collectionPage,
  '{formatMoney(fee.amountPence)} ·{" "}',
  '{formatMoney(getCaptainAllocatedAmountPence(fee.amountPence, fee.note))} ·{" "}',
  "player capped nominal display",
);
write(collectionPagePath, collectionPage);

console.log(
  "Applied admin-only maximum player charge support with captain-facing nominal settlement display.",
);
