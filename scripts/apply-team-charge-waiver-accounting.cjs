const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function write(relativePath, source) {
  const target = filePath(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Shared, auditable team-charge waiver markers.
// ---------------------------------------------------------------------------
write(
  "src/lib/payments/team-charge-waivers.ts",
  `const TEAM_CHARGE_WAIVER_PATTERN = /\\[SIXFL_TEAM_WAIVER:(\\d+)\\]/g;\n\nexport function getTeamChargeWaivedPence(description: string | null | undefined) {\n  if (!description) return 0;\n\n  let total = 0;\n  for (const match of description.matchAll(TEAM_CHARGE_WAIVER_PATTERN)) {\n    const amount = Number(match[1]);\n    if (Number.isInteger(amount) && amount > 0) total += amount;\n  }\n  return total;\n}\n\nexport function stripTeamChargeWaiverMarkers(description: string | null | undefined) {\n  if (!description) return null;\n  const cleaned = description\n    .replace(TEAM_CHARGE_WAIVER_PATTERN, \"\")\n    .replace(/[ \\t]+\\n/g, \"\\n\")\n    .replace(/[ \\t]{2,}/g, \" \" )\n    .trim();\n  return cleaned || null;\n}\n\nexport function buildTeamChargeWaiverNote(input: { amountPence: number; reason: string }) {\n  const amount = new Intl.NumberFormat(\"en-GB\", {\n    style: \"currency\",\n    currency: \"GBP\",\n  }).format(input.amountPence / 100);\n\n  return \`SIXFL waiver: \\${amount}. Reason: \\${input.reason.trim()} [SIXFL_TEAM_WAIVER:\\${input.amountPence}]\`;\n}\n`,
);

// ---------------------------------------------------------------------------
// Charge summary: waiver is settlement, never cash.
// ---------------------------------------------------------------------------
const chargeSummaryPath = "src/lib/payments/charge-summary.ts";
let chargeSummary = read(chargeSummaryPath);

if (!chargeSummary.includes('from "@/lib/payments/team-charge-waivers"')) {
  chargeSummary = chargeSummary.replace(
    'import {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";',
    'import {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";\nimport { getTeamChargeWaivedPence } from "@/lib/payments/team-charge-waivers";',
  );
}

chargeSummary = replaceRequired(
  chargeSummary,
  `type TeamChargeForSummary = {\n  amountPence: number;\n  fixtureId?: string | null;\n  status: string;`,
  `type TeamChargeForSummary = {\n  amountPence: number;\n  fixtureId?: string | null;\n  status: string;\n  description?: string | null;`,
  "charge summary description field",
);

chargeSummary = replaceRequired(
  chargeSummary,
  `    const coveredPence = paidPence + playerSubsidyPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });`,
  `    const coveredPence = paidPence + playerSubsidyPence;\n    const waivedPence = getTeamChargeWaivedPence(charge.description);\n    const settledPence = coveredPence + waivedPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: settledPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: settledPence,\n    });`,
  "charge summary waiver settlement",
);

chargeSummary = replaceRequired(
  chargeSummary,
  `      paidPence,\n      coveredPence,\n      outstandingPence,`,
  `      paidPence,\n      coveredPence,\n      waivedPence,\n      settledPence,\n      outstandingPence,`,
  "charge summary waiver return",
);

write(chargeSummaryPath, chargeSummary);

// ---------------------------------------------------------------------------
// Captain/team ledger: expose the waiver separately so the figures add up.
// ---------------------------------------------------------------------------
const ledgerPath = "src/lib/payments/team-payment-ledger.ts";
let ledger = read(ledgerPath);

if (!ledger.includes('from "@/lib/payments/team-charge-waivers"')) {
  ledger = ledger.replace(
    'import {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";',
    'import {\n  getPlayerFeeCashReceivedPence,\n  getPlayerFeeSubsidyPence,\n} from "@/lib/payments/player-fee-coverage";\nimport {\n  getTeamChargeWaivedPence,\n  stripTeamChargeWaiverMarkers,\n} from "@/lib/payments/team-charge-waivers";',
  );
}

ledger = replaceRequired(
  ledger,
  `  paidPence: number;\n  coveredPence: number;\n  outstandingPence: number;`,
  `  paidPence: number;\n  coveredPence: number;\n  waivedPence: number;\n  settledPence: number;\n  outstandingPence: number;`,
  "ledger waiver fields",
);

ledger = replaceRequired(
  ledger,
  `    const coveredPence = paidPence + playerSubsidyPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: coveredPence,\n    });`,
  `    const coveredPence = paidPence + playerSubsidyPence;\n    const waivedPence = getTeamChargeWaivedPence(charge.description);\n    const settledPence = coveredPence + waivedPence;\n    const displayStatus = getDisplayChargeStatus({\n      storedStatus: charge.status,\n      amountPence: charge.amountPence,\n      paidPence: settledPence,\n    });\n    const outstandingPence = getDisplayChargeOutstandingPence({\n      displayStatus,\n      amountPence: charge.amountPence,\n      paidPence: settledPence,\n    });`,
  "ledger waiver settlement",
);

ledger = replaceRequired(
  ledger,
  `      description: charge.description,`,
  `      description: stripTeamChargeWaiverMarkers(charge.description),`,
  "ledger waiver marker stripping",
);

ledger = replaceRequired(
  ledger,
  `      paidPence,\n      coveredPence,\n      outstandingPence,`,
  `      paidPence,\n      coveredPence,\n      waivedPence,\n      settledPence,\n      outstandingPence,`,
  "ledger waiver values",
);

write(ledgerPath, ledger);

// ---------------------------------------------------------------------------
// Captain payment breakdown: show a visible SIXFL waiver line and SETTLED status.
// ---------------------------------------------------------------------------
const captainPagePath = "src/app/captain/team/[teamid]/payments/page.tsx";
let captainPage = read(captainPagePath);

captainPage = replaceRequired(
  captainPage,
  `function formatChargeStatus(status: string) {\n  switch (status) {`,
  `function formatChargeStatus(status: string, waivedPence = 0) {\n  if (status === \"PAID\" && waivedPence > 0) return \"Settled\";\n\n  switch (status) {`,
  "captain settled status label",
);

captainPage = replaceRequired(
  captainPage,
  `              const totalAppliedPence = Math.min(\n                entry.coveredPence,\n                entry.amountPence,\n              );`,
  `              const totalAppliedPence = Math.min(\n                entry.settledPence,\n                entry.amountPence,\n              );`,
  "captain total applied waiver inclusion",
);

captainPage = replaceRequired(
  captainPage,
  `                          <div className="flex items-center justify-between gap-4">\n                            <span>Team credit used</span>\n                            <span className="font-semibold text-white">\n                              {formatMoney(teamCreditUsedPence)}\n                            </span>\n                          </div>`,
  `                          <div className="flex items-center justify-between gap-4">\n                            <span>Team credit used</span>\n                            <span className="font-semibold text-white">\n                              {formatMoney(teamCreditUsedPence)}\n                            </span>\n                          </div>\n                          {entry.waivedPence > 0 ? (\n                            <div className="flex items-center justify-between gap-4">\n                              <span>SIXFL waiver</span>\n                              <span className="font-semibold text-sky-100">\n                                {formatMoney(entry.waivedPence)}\n                              </span>\n                            </div>\n                          ) : null}`,
  "captain waiver row",
);

captainPage = replaceRequired(
  captainPage,
  `{formatChargeStatus(entry.displayStatus)}`,
  `{formatChargeStatus(entry.displayStatus, entry.waivedPence)}`,
  "captain settled status rendering",
);

captainPage = replaceRequired(
  captainPage,
  `{formatMoney(playerSettledPence)} player shares + {formatMoney(teamPaymentPence)} team payment + {formatMoney(teamCreditUsedPence)} team credit = {formatMoney(totalAppliedPence)} applied.`,
  `{formatMoney(playerSettledPence)} player shares + {formatMoney(teamPaymentPence)} team payment + {formatMoney(teamCreditUsedPence)} team credit + {formatMoney(entry.waivedPence)} SIXFL waiver = {formatMoney(totalAppliedPence)} settled.`,
  "captain settled warning arithmetic",
);

write(captainPagePath, captainPage);

// ---------------------------------------------------------------------------
// Admin endpoint: waive some/all of the OUTSTANDING amount without changing the
// original fixture charge and without recording a fake payment.
// ---------------------------------------------------------------------------
write(
  "src/app/api/admin/payments/waive-charge/route.ts",
  `import { PaymentChargeStatus, PlayerMatchFeeStatus } from \"@prisma/client\";\nimport { revalidatePath } from \"next/cache\";\nimport { NextResponse } from \"next/server\";\n\nimport { summariseChargesWithPlayerMatchFees } from \"@/lib/payments/charge-summary\";\nimport { cancelQueuedMatchFeeNotificationDispatches } from \"@/lib/payments/fixture-match-fees\";\nimport { buildTeamChargeWaiverNote } from \"@/lib/payments/team-charge-waivers\";\nimport { prisma } from \"@/lib/prisma\";\nimport { requireAdmin } from \"@/lib/requireAdmin\";\n\nfunction getString(value: unknown) {\n  const parsed = String(value ?? \"\").trim();\n  return parsed || null;\n}\n\nfunction getPositiveInt(value: unknown) {\n  const parsed = Number(value);\n  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;\n}\n\nfunction formatMoney(amountPence: number) {\n  return new Intl.NumberFormat(\"en-GB\", { style: \"currency\", currency: \"GBP\" }).format(amountPence / 100);\n}\n\nexport async function POST(request: Request) {\n  await requireAdmin();\n\n  const body = await request.json().catch(() => null);\n  const chargeId = getString((body as { chargeId?: unknown } | null)?.chargeId);\n  const waiverPence = getPositiveInt((body as { waiverPence?: unknown } | null)?.waiverPence);\n  const reason = getString((body as { reason?: unknown } | null)?.reason);\n\n  if (!chargeId || !waiverPence || !reason) {\n    return NextResponse.json({ error: \"Charge, waiver amount and reason are required.\" }, { status: 400 });\n  }\n\n  const charge = await prisma.paymentCharge.findUnique({\n    where: { id: chargeId },\n    include: { transactions: { select: { amountPence: true, notes: true } } },\n  });\n\n  if (!charge) return NextResponse.json({ error: \"Charge not found.\" }, { status: 404 });\n  if (charge.status === PaymentChargeStatus.VOID) {\n    return NextResponse.json({ error: \"A void charge cannot be waived.\" }, { status: 409 });\n  }\n\n  const playerMatchFees = charge.fixtureId\n    ? await prisma.playerMatchFee.findMany({\n        where: {\n          teamId: charge.teamId,\n          fixtureId: charge.fixtureId,\n          status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] },\n        },\n        select: { fixtureId: true, amountPence: true, status: true, note: true },\n      })\n    : [];\n\n  const [summary] = summariseChargesWithPlayerMatchFees([charge], playerMatchFees);\n  if (!summary || summary.outstandingPence <= 0) {\n    return NextResponse.json({ error: \"This charge has no outstanding amount to waive.\" }, { status: 409 });\n  }\n  if (waiverPence > summary.outstandingPence) {\n    return NextResponse.json({ error: \`You can waive up to \\${formatMoney(summary.outstandingPence)} on this charge.\` }, { status: 409 });\n  }\n\n  const newWaivedPence = summary.waivedPence + waiverPence;\n  const newSettledPence = summary.coveredPence + newWaivedPence;\n  const nextStatus =\n    newSettledPence >= charge.amountPence\n      ? PaymentChargeStatus.PAID\n      : newSettledPence > 0\n        ? PaymentChargeStatus.PART_PAID\n        : PaymentChargeStatus.OPEN;\n\n  const waiverNote = buildTeamChargeWaiverNote({ amountPence: waiverPence, reason });\n  const description = [charge.description?.trim(), waiverNote].filter(Boolean).join(\"\\n\");\n\n  await prisma.paymentCharge.update({\n    where: { id: charge.id },\n    data: {\n      status: nextStatus,\n      description,\n      lastStripeCheckoutUrl: null,\n      lastStripeCheckoutSessionId: null,\n      lastStripeCheckoutCreatedAt: null,\n      lastStripeCheckoutAmountPence: null,\n    },\n  });\n\n  await cancelQueuedMatchFeeNotificationDispatches([charge.id], prisma, {\n    reason: \`Team charge waiver recorded by admin: \\${formatMoney(waiverPence)}.\`,\n  });\n\n  revalidatePath(\"/admin/payments\");\n  revalidatePath(\`/captain/team/\\${charge.teamId}\`);\n  revalidatePath(\`/captain/team/\\${charge.teamId}/payments\`);\n  revalidatePath(\`/captain/team/\\${charge.teamId}/match-fees\`);\n\n  return NextResponse.json({\n    ok: true,\n    chargeId: charge.id,\n    chargeAmountPence: charge.amountPence,\n    waiverPence,\n    totalWaivedPence: newWaivedPence,\n    outstandingPence: Math.max(charge.amountPence - newSettledPence, 0),\n    status: nextStatus,\n  });\n}\n`,
);

// ---------------------------------------------------------------------------
// Admin buttons: split 'reduce' and 'waive' into two explicit actions.
// ---------------------------------------------------------------------------
const bridgePath = "src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx";
let bridge = read(bridgePath);

bridge = replaceRequired(
  bridge,
  `const TEAM_ADJUST_BUTTON_SELECTOR = "[data-admin-adjust-payment-charge-button]";\nconst PLAYER_VOID_BUTTON_SELECTOR`,
  `const TEAM_ADJUST_BUTTON_SELECTOR = "[data-admin-adjust-payment-charge-button]";\nconst TEAM_WAIVE_BUTTON_SELECTOR = "[data-admin-waive-payment-charge-button]";\nconst PLAYER_VOID_BUTTON_SELECTOR`,
  "admin waiver selector",
);

bridge = replaceRequired(
  bridge,
  `  document.querySelectorAll(TEAM_ADJUST_BUTTON_SELECTOR).forEach((node) => node.remove());\n  document.querySelectorAll(PLAYER_VOID_BUTTON_SELECTOR)`,
  `  document.querySelectorAll(TEAM_ADJUST_BUTTON_SELECTOR).forEach((node) => node.remove());\n  document.querySelectorAll(TEAM_WAIVE_BUTTON_SELECTOR).forEach((node) => node.remove());\n  document.querySelectorAll(PLAYER_VOID_BUTTON_SELECTOR)`,
  "admin waiver cleanup",
);

bridge = bridge
  .replace('button.textContent = "Reduce / waive";', 'button.textContent = "Reduce match fee";')
  .replace('button.title = "Reduce this match fee or waive some/all of the outstanding balance";', 'button.title = "Reduce the original match fee amount";')
  .replace('`How much do you want to reduce/waive?\\n\\n${input.item.teamName}', '`How much do you want to reduce the match fee by?\\n\\n${input.item.teamName}')
  .replace('"Reason for reducing/waiving this fee (this is kept in the charge audit note):"', '"Reason for reducing the match fee (this is kept in the charge audit note):"')
  .replace('`Confirm fee adjustment?\\n\\n${input.item.teamName}', '`Confirm match-fee reduction?\\n\\n${input.item.teamName}')
  .replace('`\\n\\nReduce/waive: ${formatMoney(waivePence)}', '`\\n\\nReduce charge by: ${formatMoney(waivePence)}')
  .replace('button.textContent = "Adjusting...";', 'button.textContent = "Reducing...";')
  .replace('`Fee adjusted successfully.\\n\\nNew charge:', '`Match fee reduced successfully.\\n\\nNew charge:')
  .replace('button.textContent = "Reduce / waive";', 'button.textContent = "Reduce match fee";');

if (!bridge.includes("function createTeamWaiverButton")) {
  const marker = `function injectTeamVoidButtons(input: {`;
  const waiverCode = `function createTeamWaiverButton(input: {\n  item: VoidableCharge;\n  onWaived: () => void;\n}) {\n  const button = document.createElement(\"button\");\n  button.type = \"button\";\n  button.dataset.adminWaivePaymentChargeButton = input.item.id;\n  button.disabled = input.item.outstandingPence <= 0;\n  button.className =\n    \"inline-flex items-center rounded-xl border border-sky-300/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40\";\n  button.textContent = \"Waive outstanding\";\n  button.title = \"Keep the original fixture charge and record a SIXFL waiver against the balance\";\n\n  button.addEventListener(\"click\", async () => {\n    const defaultAmount = (input.item.outstandingPence / 100).toFixed(2);\n    const amountText = window.prompt(\n      \`How much of the outstanding balance do you want SIXFL to waive?\\n\\n\\${input.item.teamName}\\n\\${input.item.title}\\nOriginal charge remains: \\${input.item.amount}\\nOutstanding: \\${input.item.outstanding}\\n\\nEnter waiver amount in £:\`,\n      defaultAmount,\n    );\n    if (amountText === null) return;\n\n    const amountPounds = Number(amountText.replace(/[£,\\s]/g, \"\"));\n    const waiverPence = Math.round(amountPounds * 100);\n    if (!Number.isFinite(amountPounds) || waiverPence <= 0) {\n      window.alert(\"Enter a valid amount greater than £0.00.\");\n      return;\n    }\n    if (waiverPence > input.item.outstandingPence) {\n      window.alert(\`You can waive up to \\${input.item.outstanding} on this charge.\`);\n      return;\n    }\n\n    const reason = window.prompt(\n      \"Reason for the SIXFL waiver (shown in the audit note):\",\n      \"Goodwill waiver\",\n    );\n    if (reason === null) return;\n    if (!reason.trim()) {\n      window.alert(\"Please enter a reason for the waiver.\");\n      return;\n    }\n\n    const remaining = input.item.outstandingPence - waiverPence;\n    const confirmed = window.confirm(\n      \`Confirm SIXFL waiver?\\n\\n\\${input.item.teamName}\\n\\${input.item.title}\\n\\nFixture charge stays: \\${input.item.amount}\\nSIXFL waiver: \\${formatMoney(waiverPence)}\\nRemaining outstanding: \\${formatMoney(remaining)}\\n\\nReason: \\${reason.trim()}\\n\\nThis is recorded as a waiver, not as a payment.\`,\n    );\n    if (!confirmed) return;\n\n    button.disabled = true;\n    button.textContent = \"Waiving...\";\n\n    try {\n      const response = await fetch(\"/api/admin/payments/waive-charge\", {\n        method: \"POST\",\n        headers: { \"Content-Type\": \"application/json\" },\n        body: JSON.stringify({ chargeId: input.item.id, waiverPence, reason: reason.trim() }),\n      });\n      const data = (await response.json().catch(() => null)) as\n        | { error?: string; chargeAmountPence?: number; waiverPence?: number; outstandingPence?: number }\n        | null;\n      if (!response.ok) throw new Error(data?.error ?? \"Could not waive balance.\");\n\n      window.alert(\n        \`Waiver recorded.\\n\\nFixture charge: \\${formatMoney(data?.chargeAmountPence ?? input.item.amountPence)}\\nSIXFL waiver: \\${formatMoney(data?.waiverPence ?? waiverPence)}\\nOutstanding: \\${formatMoney(data?.outstandingPence ?? remaining)}\`,\n      );\n      input.onWaived();\n    } catch (error) {\n      window.alert(error instanceof Error ? error.message : \"Could not waive balance.\");\n      button.disabled = input.item.outstandingPence <= 0;\n      button.textContent = \"Waive outstanding\";\n    }\n  });\n\n  return button;\n}\n\n`;
  if (!bridge.includes(marker)) throw new Error("Admin team void injection marker is missing.");
  bridge = bridge.replace(marker, waiverCode + marker);
}

if (!bridge.includes("function injectTeamWaiverButtons")) {
  const marker = `function getPlayerFeeCardFromForm(form: HTMLFormElement) {`;
  const waiverInject = `function injectTeamWaiverButtons(input: {\n  items: VoidableCharge[];\n  onWaived: () => void;\n}) {\n  const usedChargeIds = new Set<string>();\n\n  for (const card of findTeamChargeCards()) {\n    if (card.querySelector(TEAM_WAIVE_BUTTON_SELECTOR)) continue;\n\n    const item = findMatchingTeamCharge(card, input.items);\n    if (!item || item.outstandingPence <= 0 || usedChargeIds.has(item.id)) continue;\n\n    const actions = findTeamActionsContainer(card);\n    if (!actions) continue;\n\n    actions.appendChild(createTeamWaiverButton({ item, onWaived: input.onWaived }));\n    usedChargeIds.add(item.id);\n  }\n}\n\n`;
  if (!bridge.includes(marker)) throw new Error("Admin player-fee marker is missing.");
  bridge = bridge.replace(marker, waiverInject + marker);
}

bridge = replaceRequired(
  bridge,
  `        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n        injectPlayerVoidButtons({ onVoided: refreshPage });`,
  `        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n        injectTeamWaiverButtons({ items: latestTeamItems, onWaived: refreshPage });\n        injectPlayerVoidButtons({ onVoided: refreshPage });`,
  "admin waiver refresh injection",
);

bridge = replaceRequired(
  bridge,
  `        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n      } catch {`,
  `        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n        injectTeamWaiverButtons({ items: latestTeamItems, onWaived: refreshPage });\n      } catch {`,
  "admin waiver loaded injection",
);

bridge = replaceRequired(
  bridge,
  `      injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n      injectPlayerVoidButtons({ onVoided: refreshPage });`,
  `      injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });\n      injectTeamWaiverButtons({ items: latestTeamItems, onWaived: refreshPage });\n      injectPlayerVoidButtons({ onVoided: refreshPage });`,
  "admin waiver all injection",
);

write(bridgePath, bridge);

// ---------------------------------------------------------------------------
// Existing reduce-match-fee endpoint: reduction is distinct from a waiver and
// must respect any waiver already recorded on the charge.
// ---------------------------------------------------------------------------
const adjustPath = "src/app/api/admin/payments/adjust-charge/route.ts";
let adjust = read(adjustPath);
adjust = adjust
  .replace("Admin fee adjustment:", "Admin match-fee reduction:")
  .replace("waived/reduced.", "reduced.")
  .replace("summary.coveredPence\n        ? PaymentChargeStatus.PAID", "summary.settledPence\n        ? PaymentChargeStatus.PAID")
  .replace("summary.coveredPence > 0", "summary.settledPence > 0")
  .replace("newAmountPence - summary.coveredPence", "newAmountPence - summary.settledPence");
write(adjustPath, adjust);

// ---------------------------------------------------------------------------
// Public Stripe charge start: use the same real outstanding calculation, which
// includes player coverage and SIXFL waivers, so an old link cannot overcharge.
// ---------------------------------------------------------------------------
const payStartPath = "src/app/pay/charge/[token]/start/route.ts";
let payStart = read(payStartPath);

if (!payStart.includes('summariseChargesWithPlayerMatchFees')) {
  payStart = payStart.replace(
    'import { NextResponse } from "next/server";\n\nimport {\n  getChargeOutstandingPence,\n  getChargePaidTotal,\n} from "@/lib/payments/charge-status";',
    'import { PlayerMatchFeeStatus } from "@prisma/client";\nimport { NextResponse } from "next/server";\n\nimport { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";',
  );

  payStart = payStart.replace(
    `      transactions: {\n        select: {\n          amountPence: true,\n        },\n      },`,
    `      transactions: {\n        select: {\n          amountPence: true,\n          notes: true,\n        },\n      },`,
  );

  payStart = replaceRequired(
    payStart,
    `  const paidTotalPence = getChargePaidTotal(charge.transactions);\n  const outstandingPence = getChargeOutstandingPence(\n    charge.amountPence,\n    paidTotalPence,\n  );`,
    `  const playerMatchFees = charge.fixtureId\n    ? await prisma.playerMatchFee.findMany({\n        where: {\n          teamId: charge.teamId,\n          fixtureId: charge.fixtureId,\n          status: { in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED] },\n        },\n        select: { fixtureId: true, amountPence: true, status: true, note: true },\n      })\n    : [];\n  const [summary] = summariseChargesWithPlayerMatchFees([charge], playerMatchFees);\n  const outstandingPence = summary?.outstandingPence ?? charge.amountPence;`,
    "public charge waiver-aware outstanding",
  );
}

write(payStartPath, payStart);

console.log("Team charge waivers now remain visible, auditable and separate from payments or fee reductions.");
