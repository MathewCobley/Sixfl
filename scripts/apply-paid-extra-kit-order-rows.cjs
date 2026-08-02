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

function replaceRegexOnce(filePath, pattern, after, label) {
  let source = read(filePath);
  if (typeof after === "string" && source.includes(after)) return;
  if (!pattern.test(source)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(pattern, after);
  write(filePath, source);
}

const formPath = "src/components/captain/TeamKitOrderForm.tsx";
const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const actionPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const dbPath = "src/lib/kits/db.ts";
const extraPaymentsRoutePath =
  "src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts";
const paymentBridgePath =
  "src/components/captain/LegacyFreeKitOfferCopyBridge.tsx";
const adminKitsPath = "src/app/(admin)/admin/kits/page.tsx";

// Captain form: render one personalisation row for every currently authorised
// kit rather than always using the seven-kit included allocation.
replaceOnce(
  formPath,
  "  TEAM_KIT_QUANTITY,\n",
  "",
  "unused fixed kit quantity import",
);

replaceOnce(
  formPath,
  [
    "type Props = {",
    "  designs: Design[];",
  ].join("\n"),
  [
    "type Props = {",
    "  designs: Design[];",
    "  kitQuantity: number;",
    "  includedKitQuantity: number;",
  ].join("\n"),
  "dynamic kit quantity props",
);

replaceOnce(
  formPath,
  "function buildInitialRows(items: InitialItem[]): Row[] {",
  "function buildInitialRows(items: InitialItem[], kitQuantity: number): Row[] {",
  "dynamic initial row builder signature",
);

replaceOnce(
  formPath,
  "  return Array.from({ length: TEAM_KIT_QUANTITY }, (_, index) => {",
  "  return Array.from({ length: kitQuantity }, (_, index) => {",
  "dynamic initial row count",
);

replaceOnce(
  formPath,
  [
    "export default function TeamKitOrderForm({",
    "  designs,",
    "  initialDesignId,",
  ].join("\n"),
  [
    "export default function TeamKitOrderForm({",
    "  designs,",
    "  kitQuantity,",
    "  includedKitQuantity,",
    "  initialDesignId,",
  ].join("\n"),
  "dynamic quantity prop destructuring",
);

replaceOnce(
  formPath,
  "  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(initialItems));",
  "  const [rows, setRows] = useState<Row[]>(() =>\n    buildInitialRows(initialItems, kitQuantity),\n  );",
  "dynamic form row state",
);

replaceRegexOnce(
  formPath,
  /<h2 className="mt-2 text-2xl font-semibold text-white">Personalise all (?:seven|nine) kits<\/h2>/,
  '<h2 className="mt-2 text-2xl font-semibold text-white">Personalise all {kitQuantity} kits</h2>',
  "dynamic personalisation heading",
);

replaceOnce(
  formPath,
  [
    "          <p className=\"mt-2 max-w-3xl text-sm leading-6 text-white/55\">",
    "            Enter one row per kit. Shirt numbers must be unique. Socks are included automatically in the standard size. Leave the back name blank when a player only wants a number printed.",
    "          </p>",
  ].join("\n"),
  [
    "          <p className=\"mt-2 max-w-3xl text-sm leading-6 text-white/55\">",
    "            Enter one row per kit. Shirt numbers must be unique. Socks are included automatically in the standard size. Leave the back name blank when a player only wants a number printed.",
    "          </p>",
    "          {kitQuantity > includedKitQuantity ? (",
    "            <div className=\"mt-4 inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100\">",
    "              {includedKitQuantity} included + {kitQuantity - includedKitQuantity} paid additional",
    "            </div>",
    "          ) : null}",
  ].join("\n"),
  "paid-extra-kit allocation badge",
);

replaceOnce(
  formPath,
  "                  Kit {row.position} of {TEAM_KIT_QUANTITY}",
  "                  Kit {row.position} of {kitQuantity}",
  "dynamic row position label",
);

// Captain page: calculate the number of fully paid extra kits, reopen a submitted
// order when new rows need completing, and keep supplier-locked orders read-only.
replaceOnce(
  pagePath,
  'import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";',
  [
    'import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";',
    'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
  ].join("\n"),
  "extra-kit payment summary import",
);

replaceOnce(
  pagePath,
  [
    "  const [allDesigns, order] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    getTeamKitOrder(teamid),",
    "  ]);",
  ].join("\n"),
  [
    "  const [allDesigns, order, extraKitPaymentSummary] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    getTeamKitOrder(teamid),",
    "    getTeamExtraKitPaymentSummary(teamid),",
    "  ]);",
  ].join("\n"),
  "extra-kit payment summary query",
);

replaceOnce(
  pagePath,
  "  const locked = Boolean(order && order.status !== \"DRAFT\");",
  [
    "  const paidKitQuantity = extraKitPaymentSummary.totalKitQuantity;",
    "  const supplierLocked = Boolean(",
    "    order && [\"ORDERED\", \"FULFILLED\", \"CANCELLED\"].includes(order.status),",
    "  );",
    "  const kitQuantity = supplierLocked",
    "    ? order?.kitQuantity ?? paidKitQuantity",
    "    : Math.max(order?.kitQuantity ?? TEAM_KIT_QUANTITY, paidKitQuantity);",
    "  const canExpandSubmittedOrder = Boolean(",
    "    order &&",
    "      [\"SUBMITTED\", \"APPROVED\"].includes(order.status) &&",
    "      order.kitQuantity < kitQuantity,",
    "  );",
    "  const hasSupplierLockedExtras = Boolean(",
    "    supplierLocked && order && paidKitQuantity > order.kitQuantity,",
    "  );",
    "  const locked = Boolean(",
    "    order && order.status !== \"DRAFT\" && !canExpandSubmittedOrder,",
    "  );",
  ].join("\n"),
  "paid-extra-kit lock and quantity rules",
);

replaceRegexOnce(
  pagePath,
  /Each of the (?:seven|nine) shirts needs a different shirt number\./,
  "Every kit needs a different shirt number.",
  "dynamic duplicate-number error",
);

replaceOnce(
  pagePath,
  [
    "              Your team receives {TEAM_KIT_QUANTITY} complete kits. Choose one design,",
    "              then enter the kit size, back name and shirt number for each player.",
  ].join("\n"),
  [
    "              Your team receives {TEAM_KIT_QUANTITY} included kits",
    "              {extraKitPaymentSummary.paidExtraKitQuantity > 0",
    "                ? ` plus ${extraKitPaymentSummary.paidExtraKitQuantity} paid additional kit${extraKitPaymentSummary.paidExtraKitQuantity === 1 ? \"\" : \"s\"}`",
    "                : \"\"}. Choose one design, then enter the kit size, back name and shirt number for each player.",
  ].join("\n"),
  "dynamic captain kit allocation introduction",
);

replaceRegexOnce(
  pagePath,
  /Your (?:seven|nine)-kit order has been submitted to SIXFL\./,
  "Your {kitQuantity}-kit order has been submitted to SIXFL.",
  "dynamic submitted order quantity",
);

replaceOnce(
  pagePath,
  [
    "      {sp.submitted === \"1\" ? (",
    "        <div className=\"rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100\">",
  ].join("\n"),
  [
    "      {canExpandSubmittedOrder ? (",
    "        <div className=\"rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100\">",
    "          Additional kits have now been paid for. This order has been reopened so you can complete kit {order ? order.kitQuantity + 1 : TEAM_KIT_QUANTITY + 1} to {kitQuantity}, then submit it again.",
    "        </div>",
    "      ) : null}",
    "",
    "      {hasSupplierLockedExtras ? (",
    "        <div className=\"rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100\">",
    "          Additional-kit payment has been received, but this supplier order is already locked. Contact SIXFL so the extra kit details can be added safely.",
    "        </div>",
    "      ) : null}",
    "",
    "      {extraKitPaymentSummary.pendingExtraKitQuantity > 0 ? (",
    "        <div className=\"rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65\">",
    "          {extraKitPaymentSummary.pendingExtraKitQuantity} additional kit{extraKitPaymentSummary.pendingExtraKitQuantity === 1 ? \" is\" : \"s are\"} awaiting full payment. Its personalisation box will unlock only when the complete payment batch is paid.",
    "        </div>",
    "      ) : null}",
    "",
    "      {sp.submitted === \"1\" ? (",
    "        <div className=\"rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100\">",
  ].join("\n"),
  "extra-kit payment notices",
);

replaceOnce(
  pagePath,
  [
    "        <TeamKitOrderForm",
    "          designs={designs.map((design) => ({",
  ].join("\n"),
  [
    "        <TeamKitOrderForm",
    "          key={`team-kit-order-${kitQuantity}`}",
    "          kitQuantity={kitQuantity}",
    "          includedKitQuantity={TEAM_KIT_QUANTITY}",
    "          designs={designs.map((design) => ({",
  ].join("\n"),
  "dynamic kit form props",
);

// Server action: never trust a client-supplied quantity. Recalculate paid batches
// on every save and only permit expansion of drafts/submitted orders.
replaceOnce(
  actionPath,
  'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
  [
    'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
    'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
  ].join("\n"),
  "kit action payment summary import",
);

replaceOnce(
  actionPath,
  [
    "  const access = await requireCaptain(teamId);",
    "  const existingOrder = await getTeamKitOrder(teamId);",
    "",
    "  if (existingOrder && existingOrder.status !== \"DRAFT\") {",
    "    redirect(buildRedirect(teamId, { error: \"order_locked\" }));",
    "  }",
  ].join("\n"),
  [
    "  const access = await requireCaptain(teamId);",
    "  const [existingOrder, extraKitPaymentSummary] = await Promise.all([",
    "    getTeamKitOrder(teamId),",
    "    getTeamExtraKitPaymentSummary(teamId),",
    "  ]);",
    "  const kitQuantity = Math.max(",
    "    existingOrder?.kitQuantity ?? TEAM_KIT_QUANTITY,",
    "    extraKitPaymentSummary.totalKitQuantity,",
    "  );",
    "  const canExpandSubmittedOrder = Boolean(",
    "    existingOrder &&",
    "      [\"SUBMITTED\", \"APPROVED\"].includes(existingOrder.status) &&",
    "      existingOrder.kitQuantity < kitQuantity,",
    "  );",
    "",
    "  if (",
    "    existingOrder &&",
    "    existingOrder.status !== \"DRAFT\" &&",
    "    !canExpandSubmittedOrder",
    "  ) {",
    "    redirect(buildRedirect(teamId, { error: \"order_locked\" }));",
    "  }",
  ].join("\n"),
  "server-authorised kit quantity and reopening rule",
);

replaceOnce(
  actionPath,
  "  for (let position = 1; position <= TEAM_KIT_QUANTITY; position += 1) {",
  "  for (let position = 1; position <= kitQuantity; position += 1) {",
  "dynamic server-side personalisation loop",
);

replaceOnce(
  actionPath,
  [
    "    await saveTeamKitOrder({",
    "      teamId,",
    "      kitDesignId,",
  ].join("\n"),
  [
    "    await saveTeamKitOrder({",
    "      teamId,",
    "      kitDesignId,",
    "      kitQuantity,",
  ].join("\n"),
  "dynamic quantity persistence input",
);

// Kit database helper: persist the authorised dynamic quantity instead of
// resetting every save to the included allocation.
replaceOnce(
  dbPath,
  "  TEAM_KIT_QUANTITY,\n",
  "  TEAM_KIT_MAX_QUANTITY,\n  TEAM_KIT_QUANTITY,\n",
  "maximum kit quantity import",
);

replaceOnce(
  dbPath,
  [
    "export async function saveTeamKitOrder(input: {",
    "  teamId: string;",
    "  kitDesignId: string;",
  ].join("\n"),
  [
    "export async function saveTeamKitOrder(input: {",
    "  teamId: string;",
    "  kitDesignId: string;",
    "  kitQuantity: number;",
  ].join("\n"),
  "dynamic kit quantity save input",
);

replaceOnce(
  dbPath,
  [
    "  if (input.items.length !== TEAM_KIT_QUANTITY) {",
    "    throw new Error(`Exactly ${TEAM_KIT_QUANTITY} kit entries are required.`);",
    "  }",
  ].join("\n"),
  [
    "  if (",
    "    !Number.isInteger(input.kitQuantity) ||",
    "    input.kitQuantity < TEAM_KIT_QUANTITY ||",
    "    input.kitQuantity > TEAM_KIT_MAX_QUANTITY",
    "  ) {",
    "    throw new Error(\"The authorised kit quantity is invalid.\");",
    "  }",
    "",
    "  if (input.items.length !== input.kitQuantity) {",
    "    throw new Error(`Exactly ${input.kitQuantity} kit entries are required.`);",
    "  }",
  ].join("\n"),
  "dynamic kit quantity validation",
);

replaceOnce(
  dbPath,
  '          "kitQuantity" = ${TEAM_KIT_QUANTITY},',
  '          "kitQuantity" = ${input.kitQuantity},',
  "dynamic existing-order quantity",
);

replaceOnce(
  dbPath,
  "          ${TEAM_KIT_QUANTITY},",
  "          ${input.kitQuantity},",
  "dynamic new-order quantity",
);

// Payment API: expose the number of paid and pending extra kits so the captain
// payment panel and the server-rendered form agree on the same source of truth.
replaceOnce(
  extraPaymentsRoutePath,
  'import { queueDirectNotification } from "@/lib/notifications/service";',
  [
    'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
    'import { queueDirectNotification } from "@/lib/notifications/service";',
  ].join("\n"),
  "extra-kit summary API import",
);

replaceOnce(
  extraPaymentsRoutePath,
  [
    "  const [team, eligibility, requests] = await Promise.all([",
    "    getTeamData(teamid),",
    "    getKitEligibility(teamid),",
    "    getExtraKitCharges(teamid),",
    "  ]);",
  ].join("\n"),
  [
    "  const [team, eligibility, requests, paymentSummary] = await Promise.all([",
    "    getTeamData(teamid),",
    "    getKitEligibility(teamid),",
    "    getExtraKitCharges(teamid),",
    "    getTeamExtraKitPaymentSummary(teamid),",
    "  ]);",
  ].join("\n"),
  "extra-kit summary API query",
);

replaceOnce(
  extraPaymentsRoutePath,
  [
    "    includedKitQuantity: INCLUDED_KIT_QUANTITY,",
    "    extraKitPricePence: EXTRA_KIT_PRICE_PENCE,",
  ].join("\n"),
  [
    "    includedKitQuantity: paymentSummary.includedKitQuantity,",
    "    paidExtraKitQuantity: paymentSummary.paidExtraKitQuantity,",
    "    pendingExtraKitQuantity: paymentSummary.pendingExtraKitQuantity,",
    "    totalKitQuantity: paymentSummary.totalKitQuantity,",
    "    extraKitPricePence: EXTRA_KIT_PRICE_PENCE,",
  ].join("\n"),
  "extra-kit summary API response",
);

// Captain payment bridge: make the payment state explicit and make its Refresh
// button refresh the server-rendered personalisation form as well.
replaceOnce(
  paymentBridgePath,
  'import { usePathname } from "next/navigation";',
  'import { usePathname, useRouter } from "next/navigation";',
  "payment bridge router import",
);

replaceOnce(
  paymentBridgePath,
  [
    "  includedKitQuantity?: number;",
    "  extraKitPricePence?: number;",
  ].join("\n"),
  [
    "  includedKitQuantity?: number;",
    "  paidExtraKitQuantity?: number;",
    "  pendingExtraKitQuantity?: number;",
    "  totalKitQuantity?: number;",
    "  extraKitPricePence?: number;",
  ].join("\n"),
  "payment bridge summary fields",
);

replaceOnce(
  paymentBridgePath,
  [
    "export default function LegacyFreeKitOfferCopyBridge() {",
    "  const pathname = usePathname();",
  ].join("\n"),
  [
    "export default function LegacyFreeKitOfferCopyBridge() {",
    "  const pathname = usePathname();",
    "  const router = useRouter();",
  ].join("\n"),
  "payment bridge router instance",
);

replaceOnce(
  paymentBridgePath,
  "  async function load() {",
  "  async function load(refreshKitForm = false) {",
  "payment refresh mode",
);

replaceOnce(
  paymentBridgePath,
  "      setData(payload);",
  [
    "      setData(payload);",
    "      if (refreshKitForm) router.refresh();",
  ].join("\n"),
  "server form refresh after payment refresh",
);

replaceOnce(
  paymentBridgePath,
  [
    "            <p className=\"mt-2 max-w-3xl text-sm leading-6 text-white/60\">",
    "              Select one team member to pay the full amount, or select several members to split the total equally. Each selected person receives their own secure payment link by email.",
    "            </p>",
  ].join("\n"),
  [
    "            <p className=\"mt-2 max-w-3xl text-sm leading-6 text-white/60\">",
    "              Select one team member to pay the full amount, or select several members to split the total equally. Each selected person receives their own secure payment link by email.",
    "            </p>",
    "            {(data.paidExtraKitQuantity ?? 0) > 0 ? (",
    "              <div className=\"mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100\">",
    "                {data.paidExtraKitQuantity} additional kit{data.paidExtraKitQuantity === 1 ? \" has\" : \"s have\"} been paid for. Your order now has {data.totalKitQuantity} personalisation boxes.",
    "              </div>",
    "            ) : null}",
    "            {(data.pendingExtraKitQuantity ?? 0) > 0 ? (",
    "              <div className=\"mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100\">",
    "                {data.pendingExtraKitQuantity} additional kit{data.pendingExtraKitQuantity === 1 ? \" is\" : \"s are\"} waiting for the complete payment batch. No new boxes unlock until the whole batch is paid.",
    "              </div>",
    "            ) : null}",
  ].join("\n"),
  "paid and pending extra-kit status",
);

replaceOnce(
  paymentBridgePath,
  "                onClick={() => void load()}",
  "                onClick={() => void load(true)}",
  "payment and kit box refresh button",
);

replaceOnce(
  paymentBridgePath,
  "                Refresh\n",
  "                Refresh payments and kit boxes\n",
  "payment refresh button label",
);

// Admin copy and cards should reflect actual per-order quantities.
replaceOnce(
  adminKitsPath,
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of {TEAM_KIT_QUANTITY} kits.",
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s included and paid additional kits.",
  "dynamic admin kit order copy",
);

replaceOnce(
  adminKitsPath,
  [
    "                            <p className=\"mt-2 text-sm text-white/60\">",
    "                              Design: <span className=\"font-semibold text-white\">{order.design?.code ?? \"Not chosen\"}</span>",
    "                              {order.design?.name ? ` · ${order.design.name}` : \"\"}",
    "                            </p>",
  ].join("\n"),
  [
    "                            <p className=\"mt-2 text-sm text-white/60\">",
    "                              Design: <span className=\"font-semibold text-white\">{order.design?.code ?? \"Not chosen\"}</span>",
    "                              {order.design?.name ? ` · ${order.design.name}` : \"\"}",
    "                            </p>",
    "                            <p className=\"mt-1 text-sm font-semibold text-sky-100/80\">",
    "                              {order.kitQuantity} complete kit{order.kitQuantity === 1 ? \"\" : \"s\"}",
    "                            </p>",
  ].join("\n"),
  "admin order quantity display",
);

const assertions = [
  [formPath, "buildInitialRows(initialItems, kitQuantity)"],
  [formPath, "Kit {row.position} of {kitQuantity}"],
  [pagePath, "getTeamExtraKitPaymentSummary(teamid)"],
  [pagePath, "kitQuantity={kitQuantity}"],
  [actionPath, "const existingChase"],
  [actionPath, "getTeamExtraKitPaymentSummary(teamId)"],
  [dbPath, "kitQuantity: number;"],
  [dbPath, '"kitQuantity" = ${input.kitQuantity}'],
  [extraPaymentsRoutePath, "paidExtraKitQuantity: paymentSummary.paidExtraKitQuantity"],
  [paymentBridgePath, "Refresh payments and kit boxes"],
];

for (const [filePath, marker] of assertions) {
  if (!read(filePath).includes(marker)) {
    throw new Error(`Paid extra-kit row marker ${marker} is missing from ${filePath}`);
  }
}

console.log(
  "Fully paid additional-kit batches now unlock matching personalisation rows; partial batches, duplicates and supplier-locked orders remain protected.",
);
