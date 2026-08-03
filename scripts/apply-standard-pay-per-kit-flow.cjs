const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(before, after);
  write(filePath, source);
}

const summaryPath = "src/lib/kits/extra-kit-quantity.ts";
const paymentRoutePath =
  "src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts";
const captainPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const captainActionPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const assignmentComponentPath =
  "src/components/captain/TeamKitPlayerAssignments.tsx";
const assignmentRoutePath =
  "src/app/api/captain/team/[teamid]/kit-player-assignments/route.ts";

// A team's included quantity is determined by its own kit-offer record. Standard
// teams start at zero and only gain order rows when £20 kit payments complete.
write(
  summaryPath,
  `import { Prisma } from "@prisma/client";

import {
  TEAM_KIT_MAX_QUANTITY,
  TEAM_KIT_QUANTITY,
} from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";

export const EXTRA_KIT_PRICE_PENCE = 2000;
export const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

const EXTRA_KIT_DESCRIPTION_PATTERN =
  /^(\\d+)\\s+additional complete kits?\\s+for\\s+.+?\\s+at\\s+£20\\s+each\\.\\s+Payment batch\\s+([a-z0-9-]+)\\.?$/i;

type ExtraKitChargeRow = {
  id: string;
  description: string | null;
  amountPence: number;
  status: string;
  paidPence: bigint | number;
};

type ParsedBatch = {
  batchReference: string;
  quantity: number;
};

type BatchAccumulator = {
  quantity: number;
  invalid: boolean;
  voided: boolean;
  chargeCount: number;
  chargedPence: number;
  paidPence: number;
  everyChargePaid: boolean;
};

export type TeamExtraKitPaymentSummary = {
  includedKitQuantity: number;
  paidExtraKitQuantity: number;
  pendingExtraKitQuantity: number;
  totalKitQuantity: number;
  completedBatchCount: number;
};

function parseBatch(description: string | null): ParsedBatch | null {
  const match = description?.trim().match(EXTRA_KIT_DESCRIPTION_PATTERN);
  if (!match) return null;

  const quantity = Number(match[1]);
  const batchReference = match[2]?.trim().toLowerCase() ?? "";

  if (!Number.isInteger(quantity) || quantity < 1 || !batchReference) {
    return null;
  }

  return { batchReference, quantity };
}

async function getIncludedKitQuantity(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ included: boolean }>>(Prisma.sql\`
    SELECT (
      EXISTS (
        SELECT 1
        FROM "InterestLead" lead
        WHERE lead."convertedTeamId" = \${teamId}
          AND lead."wantsFreeKit" = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM "Team" kit_team
        WHERE kit_team."id" = \${teamId}
          AND kit_team."wantsFreeKit" = TRUE
      )
    ) AS "included"
  \`);

  return rows[0]?.included ? TEAM_KIT_QUANTITY : 0;
}

function emptySummary(includedKitQuantity: number): TeamExtraKitPaymentSummary {
  return {
    includedKitQuantity,
    paidExtraKitQuantity: 0,
    pendingExtraKitQuantity: 0,
    totalKitQuantity: includedKitQuantity,
    completedBatchCount: 0,
  };
}

export async function getTeamExtraKitPaymentSummary(
  teamId: string,
): Promise<TeamExtraKitPaymentSummary> {
  const cleanTeamId = teamId.trim();
  if (!cleanTeamId) return emptySummary(0);

  const includedKitQuantity = await getIncludedKitQuantity(cleanTeamId);
  const rows = await prisma.$queryRaw<ExtraKitChargeRow[]>(Prisma.sql\`
    SELECT
      charge."id",
      charge."description",
      charge."amountPence",
      charge."status"::text AS "status",
      COALESCE(SUM(transaction."amountPence"), 0)::bigint AS "paidPence"
    FROM "PaymentCharge" AS charge
    LEFT JOIN "PaymentTransaction" AS transaction
      ON transaction."chargeId" = charge."id"
    WHERE charge."teamId" = \${cleanTeamId}
      AND charge."title" LIKE \${\`\${EXTRA_KIT_TITLE_PREFIX}%\`}
    GROUP BY
      charge."id",
      charge."description",
      charge."amountPence",
      charge."status"
    ORDER BY charge."createdAt" ASC
  \`);

  const batches = new Map<string, BatchAccumulator>();

  for (const row of rows) {
    const parsed = parseBatch(row.description);
    if (!parsed) continue;

    const paidPence = Number(row.paidPence);
    const current = batches.get(parsed.batchReference) ?? {
      quantity: parsed.quantity,
      invalid: false,
      voided: false,
      chargeCount: 0,
      chargedPence: 0,
      paidPence: 0,
      everyChargePaid: true,
    };

    if (current.quantity !== parsed.quantity) current.invalid = true;
    current.chargeCount += 1;
    current.chargedPence += row.amountPence;
    current.paidPence += Math.max(0, paidPence);
    current.voided ||= row.status === "VOID";
    current.everyChargePaid &&= paidPence >= row.amountPence;
    batches.set(parsed.batchReference, current);
  }

  let paidExtraKitQuantity = 0;
  let pendingExtraKitQuantity = 0;
  let completedBatchCount = 0;

  for (const batch of batches.values()) {
    if (batch.invalid || batch.voided || batch.chargeCount < 1) continue;

    const expectedPence = batch.quantity * EXTRA_KIT_PRICE_PENCE;
    const fullyPaid =
      batch.chargedPence === expectedPence &&
      batch.paidPence >= expectedPence &&
      batch.everyChargePaid;

    if (fullyPaid) {
      paidExtraKitQuantity += batch.quantity;
      completedBatchCount += 1;
    } else {
      pendingExtraKitQuantity += batch.quantity;
    }
  }

  const maximumExtraKitQuantity = Math.max(
    0,
    TEAM_KIT_MAX_QUANTITY - includedKitQuantity,
  );
  paidExtraKitQuantity = Math.min(
    paidExtraKitQuantity,
    maximumExtraKitQuantity,
  );
  pendingExtraKitQuantity = Math.min(
    pendingExtraKitQuantity,
    Math.max(0, maximumExtraKitQuantity - paidExtraKitQuantity),
  );

  return {
    includedKitQuantity,
    paidExtraKitQuantity,
    pendingExtraKitQuantity,
    totalKitQuantity: includedKitQuantity + paidExtraKitQuantity,
    completedBatchCount,
  };
}
`,
);

// Standard teams infer one £20 kit per selected player. Existing offer teams keep
// the quantity-and-split contribution workflow for additional kits.
replaceOnce(
  paymentRoutePath,
  "  const quantity = Number(payload?.quantity);",
  "  const requestedQuantity = Number(payload?.quantity);",
  "requested kit quantity",
);

replaceOnce(
  paymentRoutePath,
  [
    "  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {",
    "    return NextResponse.json(",
    '      { error: "Choose between 1 and 10 additional kits." },',
    "      { status: 400 },",
    "    );",
    "  }",
    "",
  ].join("\n"),
  "",
  "early quantity validation",
);

replaceOnce(
  paymentRoutePath,
  [
    "  if (!eligibility.eligible) {",
    "    return NextResponse.json(",
    '      { error: "This team is not eligible for the kit offer." },',
    "      { status: 403 },",
    "    );",
    "  }",
  ].join("\n"),
  [
    "  const purchaseOnly = !eligibility.eligible;",
    "  const quantity = purchaseOnly ? memberIds.length : requestedQuantity;",
    "",
    "  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {",
    "    return NextResponse.json(",
    "      {",
    "        error: purchaseOnly",
    '          ? "Select between 1 and 10 squad members who want a kit."',
    '          : "Choose between 1 and 10 additional kits.",',
    "      },",
    "      { status: 400 },",
    "    );",
    "  }",
  ].join("\n"),
  "standard pay-per-kit mode",
);

replaceOnce(
  paymentRoutePath,
  [
    "  const totalPence = quantity * EXTRA_KIT_PRICE_PENCE;",
    "  const baseSharePence = Math.floor(totalPence / selectedMembers.length);",
    "  const remainderPence = totalPence % selectedMembers.length;",
  ].join("\n"),
  [
    "  const totalPence = quantity * EXTRA_KIT_PRICE_PENCE;",
    "  const baseSharePence = purchaseOnly",
    "    ? EXTRA_KIT_PRICE_PENCE",
    "    : Math.floor(totalPence / selectedMembers.length);",
    "  const remainderPence = purchaseOnly",
    "    ? 0",
    "    : totalPence % selectedMembers.length;",
  ].join("\n"),
  "one-kit-per-player charge amount",
);

replaceOnce(
  paymentRoutePath,
  '    eligible: eligibility.eligible,\n    legacyOffer: eligibility.legacyOffer,',
  '    eligible: eligibility.eligible,\n    purchaseOnly: !eligibility.eligible,\n    legacyOffer: eligibility.legacyOffer,',
  "purchase-only API flag",
);

replaceOnce(
  paymentRoutePath,
  "    includedKitQuantity: INCLUDED_KIT_QUANTITY,",
  "    includedKitQuantity: paymentSummary.includedKitQuantity,",
  "dynamic included quantity response",
);

replaceOnce(
  paymentRoutePath,
  '        subject: `${team.name} additional kit contribution`,',
  [
    "        subject: purchaseOnly",
    '          ? `${team.name}: pay £20 for your SIXFL kit`',
    '          : `${team.name} additional kit contribution`,',
  ].join("\n"),
  "standard kit payment email subject",
);

replaceOnce(
  paymentRoutePath,
  '        body: `Hi ${payerName},\\n\\nYour captain has asked you to contribute ${formatMoney(charge.amountPence)} towards ${quantity} additional SIXFL team kit${quantity === 1 ? "" : "s"}. The extra kits cost £20 each and the total has been divided between the selected team members.\\n\\nUse the secure payment link below.`,',
  [
    "        body: purchaseOnly",
    '          ? `Hi ${payerName},\\n\\nYour captain has added you to the ${team.name} kit order. One complete SIXFL kit costs £20.\\n\\nUse the secure payment link below. Once it is paid, your kit details can be completed.`',
    '          : `Hi ${payerName},\\n\\nYour captain has asked you to contribute ${formatMoney(charge.amountPence)} towards ${quantity} additional SIXFL team kit${quantity === 1 ? "" : "s"}. The extra kits cost £20 each and the total has been divided between the selected team members.\\n\\nUse the secure payment link below.`,',
  ].join("\n"),
  "standard kit payment email body",
);

replaceOnce(
  paymentRoutePath,
  '          label: "Pay kit contribution",',
  '          label: purchaseOnly ? "Pay £20 for my kit" : "Pay kit contribution",',
  "standard payment CTA",
);

// The server-rendered order must start at zero for standard teams. Paid links
// unlock exactly the number of order rows paid for; the fixed seven-kit wording
// remains only for teams that actually have seven included kits.
replaceOnce(
  captainPagePath,
  "  const paidKitQuantity = extraKitPaymentSummary.totalKitQuantity;",
  [
    "  const includedKitQuantity = extraKitPaymentSummary.includedKitQuantity;",
    "  const purchaseOnly = includedKitQuantity === 0;",
    "  const paidKitQuantity = extraKitPaymentSummary.totalKitQuantity;",
  ].join("\n"),
  "captain page included quantity",
);

replaceOnce(
  captainPagePath,
  "    : Math.max(order?.kitQuantity ?? TEAM_KIT_QUANTITY, paidKitQuantity);",
  [
    "    : purchaseOnly",
    "      ? paidKitQuantity",
    "      : Math.max(order?.kitQuantity ?? includedKitQuantity, paidKitQuantity);",
  ].join("\n"),
  "purchase-only authorised quantity",
);

replaceOnce(
  captainPagePath,
  [
    "              Your team receives {TEAM_KIT_QUANTITY} included kits",
    "              {extraKitPaymentSummary.paidExtraKitQuantity > 0",
    '                ? ` plus ${extraKitPaymentSummary.paidExtraKitQuantity} paid additional kit${extraKitPaymentSummary.paidExtraKitQuantity === 1 ? "" : "s"}`',
    '                : ""}. Choose one design, then enter the kit size, back name and shirt number for each player.',
  ].join("\n"),
  [
    "              {purchaseOnly ? (",
    "                <>",
    "                  Complete kits cost £20 each. Select the squad members who want one using the payment section above. Paid kits will appear below for personalisation.",
    "                </>",
    "              ) : (",
    "                <>",
    "                  Your team receives {includedKitQuantity} included kits",
    "                  {extraKitPaymentSummary.paidExtraKitQuantity > 0",
    '                    ? ` plus ${extraKitPaymentSummary.paidExtraKitQuantity} paid additional kit${extraKitPaymentSummary.paidExtraKitQuantity === 1 ? "" : "s"}`',
    '                    : ""}. Choose one design, then enter the kit size, back name and shirt number for each player.',
    "                </>",
    "              )}",
  ].join("\n"),
  "purchase-only captain introduction",
);

replaceOnce(
  captainPagePath,
  "          includedKitQuantity={TEAM_KIT_QUANTITY}",
  "          includedKitQuantity={includedKitQuantity}",
  "dynamic included quantity form prop",
);

replaceOnce(
  captainPagePath,
  "      {designs.length === 0 ? (",
  "      {kitQuantity <= 0 ? null : designs.length === 0 ? (",
  "hide order form until a standard kit is paid",
);

const assignmentPanelBefore = [
  "      <TeamKitPlayerAssignments",
  "        teamId={team.id}",
  "        locked={locked}",
  "        initialMembers={kitMembers}",
  "        initialAssignments={kitAssignments.map((assignment) => ({",
  "          ...assignment,",
  "          sentAt: assignment.sentAt?.toISOString() ?? null,",
  "          lastSentAt: assignment.lastSentAt?.toISOString() ?? null,",
  "          openedAt: assignment.openedAt?.toISOString() ?? null,",
  "          completedAt: assignment.completedAt?.toISOString() ?? null,",
  "          createdAt: assignment.createdAt.toISOString(),",
  "          updatedAt: assignment.updatedAt.toISOString(),",
  "          dispatchSentAt: assignment.dispatchSentAt?.toISOString() ?? null,",
  "        }))}",
  "      />",
].join("\n");
const assignmentPanelAfter = [
  "      {kitQuantity > 0 ? (",
  "        <TeamKitPlayerAssignments",
  "          teamId={team.id}",
  "          kitQuantity={kitQuantity}",
  "          locked={locked}",
  "          initialMembers={kitMembers}",
  "          initialAssignments={kitAssignments.map((assignment) => ({",
  "            ...assignment,",
  "            sentAt: assignment.sentAt?.toISOString() ?? null,",
  "            lastSentAt: assignment.lastSentAt?.toISOString() ?? null,",
  "            openedAt: assignment.openedAt?.toISOString() ?? null,",
  "            completedAt: assignment.completedAt?.toISOString() ?? null,",
  "            createdAt: assignment.createdAt.toISOString(),",
  "            updatedAt: assignment.updatedAt.toISOString(),",
  "            dispatchSentAt: assignment.dispatchSentAt?.toISOString() ?? null,",
  "          }))}",
  "        />",
  "      ) : purchaseOnly ? (",
  "        <section className=\"rounded-3xl border border-dashed border-sky-400/20 bg-sky-500/[0.05] p-6 text-sm text-white/60\">",
  "          No kit boxes are available yet. Send £20 payment links to the players who want a kit; each completed payment unlocks one box.",
  "        </section>",
  "      ) : null}",
].join("\n");
replaceOnce(
  captainPagePath,
  assignmentPanelBefore,
  assignmentPanelAfter,
  "dynamic player kit assignment panel",
);

// Saving is also authorised from the same payment summary, so a standard team
// cannot submit seven unpaid rows by posting a forged form.
replaceOnce(
  captainActionPath,
  "  const kitQuantity = Math.max(\n    existingOrder?.kitQuantity ?? TEAM_KIT_QUANTITY,\n    extraKitPaymentSummary.totalKitQuantity,\n  );",
  [
    "  const includedKitQuantity = extraKitPaymentSummary.includedKitQuantity;",
    "  const purchaseOnly = includedKitQuantity === 0;",
    "  const kitQuantity = purchaseOnly",
    "    ? extraKitPaymentSummary.totalKitQuantity",
    "    : Math.max(",
    "        existingOrder?.kitQuantity ?? includedKitQuantity,",
    "        extraKitPaymentSummary.totalKitQuantity,",
    "      );",
    "",
    "  if (kitQuantity < 1) {",
    "    redirect(buildRedirect(teamId, { error: \"no_paid_kits\" }));",
    "  }",
  ].join("\n"),
  "server-side paid kit quantity",
);

// Assignment controls and the secure assignment API use the paid/included total
// rather than the global seven-kit constant.
replaceOnce(
  assignmentComponentPath,
  "import { TEAM_KIT_QUANTITY, getTeamKitSizeLabel, type TeamKitSize } from \"@/lib/kits/constants\";",
  "import { getTeamKitSizeLabel, type TeamKitSize } from \"@/lib/kits/constants\";",
  "assignment component quantity import",
);

replaceOnce(
  assignmentComponentPath,
  "type Props = {\n  teamId: string;",
  "type Props = {\n  teamId: string;\n  kitQuantity: number;",
  "assignment component quantity prop",
);

replaceOnce(
  assignmentComponentPath,
  "  teamId,\n  initialMembers,",
  "  teamId,\n  kitQuantity,\n  initialMembers,",
  "assignment component quantity destructuring",
);

replaceOnce(
  assignmentComponentPath,
  "            {TEAM_KIT_QUANTITY - assignments.length} not assigned",
  "            {Math.max(0, kitQuantity - assignments.length)} not assigned",
  "assignment unassigned count",
);

replaceOnce(
  assignmentComponentPath,
  "        {Array.from({ length: TEAM_KIT_QUANTITY }, (_, index) => index + 1).map((position) => {",
  "        {Array.from({ length: kitQuantity }, (_, index) => index + 1).map((position) => {",
  "assignment dynamic rows",
);

replaceOnce(
  assignmentComponentPath,
  "                  <div className=\"text-sm font-semibold text-white\">Kit {position} of {TEAM_KIT_QUANTITY}</div>",
  "                  <div className=\"text-sm font-semibold text-white\">Kit {position} of {kitQuantity}</div>",
  "assignment dynamic row label",
);

replaceOnce(
  assignmentRoutePath,
  'import { TEAM_KIT_QUANTITY } from "@/lib/kits/constants";',
  'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
  "assignment API payment summary import",
);

replaceOnce(
  assignmentRoutePath,
  [
    "function validPosition(value: unknown) {",
    "  const position = Number(value);",
    "  return Number.isInteger(position) && position >= 1 && position <= TEAM_KIT_QUANTITY",
    "    ? position",
    "    : null;",
    "}",
  ].join("\n"),
  [
    "function validPosition(value: unknown, maximumPosition: number) {",
    "  const position = Number(value);",
    "  return Number.isInteger(position) &&",
    "    position >= 1 &&",
    "    position <= maximumPosition",
    "    ? position",
    "    : null;",
    "}",
  ].join("\n"),
  "assignment API dynamic position validator",
);

replaceOnce(
  assignmentRoutePath,
  [
    "  const { teamid } = await params;",
    "  const access = await requireCaptain(teamid);",
    "  const body = (await request.json().catch(() => null)) as",
  ].join("\n"),
  [
    "  const { teamid } = await params;",
    "  const access = await requireCaptain(teamid);",
    "  const paymentSummary = await getTeamExtraKitPaymentSummary(teamid);",
    "  const body = (await request.json().catch(() => null)) as",
  ].join("\n"),
  "assignment API payment summary query",
);

replaceOnce(
  assignmentRoutePath,
  "  const position = validPosition(body?.position);",
  "  const position = validPosition(\n    body?.position,\n    paymentSummary.totalKitQuantity,\n  );",
  "assignment API authorised position",
);

for (const [filePath, marker] of [
  [summaryPath, "totalKitQuantity: includedKitQuantity + paidExtraKitQuantity"],
  [paymentRoutePath, "const purchaseOnly = !eligibility.eligible"],
  [captainPagePath, "No kit boxes are available yet"],
  [captainActionPath, 'error: "no_paid_kits"'],
  [assignmentComponentPath, "kitQuantity: number;"],
  [assignmentRoutePath, "paymentSummary.totalKitQuantity"],
]) {
  if (!read(filePath).includes(marker)) {
    throw new Error(`Standard pay-per-kit marker ${marker} is missing from ${filePath}`);
  }
}

console.log(
  "Standard teams now send one £20 link per player and only receive kit rows after payment.",
);
