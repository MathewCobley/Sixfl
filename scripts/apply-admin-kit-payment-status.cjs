const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const filePath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "kits",
  "page.tsx",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Admin kit page is missing.");
}

let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('from "@/lib/kits/extra-kit-quantity"')) {
  const anchor = 'import { requireAdmin } from "@/lib/requireAdmin";';
  if (!source.includes(anchor)) {
    throw new Error("Admin kit helper import anchor was not found.");
  }
  source = source.replace(
    anchor,
    'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\n' + anchor,
  );
}

if (!source.includes("extraKitPaymentByTeamId")) {
  const anchor = [
    "  const [allDesigns, orders] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    listAdminTeamKitOrders(),",
    "  ]);",
  ].join("\n");
  if (!source.includes(anchor)) {
    throw new Error("Admin kit orders query anchor was not found.");
  }
  source = source.replace(
    anchor,
    anchor +
      "\n\n  const extraKitPaymentByTeamId = new Map(\n" +
      "    await Promise.all(\n" +
      "      orders.map(async (order) => [\n" +
      "        order.teamId,\n" +
      "        await getTeamExtraKitPaymentSummary(order.teamId),\n" +
      "      ] as const),\n" +
      "    ),\n" +
      "  );",
  );
}

if (!source.includes("orderPaymentPending")) {
  const anchor =
    '              const sockSizes = countValues(order.items.map((item) => item.sockSize));';
  if (!source.includes(anchor)) {
    throw new Error("Admin kit order loop anchor was not found.");
  }
  source = source.replace(
    anchor,
    [
      anchor,
      "              const extraKitPaymentSummary = extraKitPaymentByTeamId.get(order.teamId);",
      "              const pendingExtraKitQuantity =",
      "                extraKitPaymentSummary?.pendingExtraKitQuantity ?? 0;",
      "              const authorisedKitQuantity =",
      "                extraKitPaymentSummary?.totalKitQuantity ?? order.kitQuantity;",
      "              const orderPaymentPending = pendingExtraKitQuantity > 0;",
      "              const orderNeedsCompletion =",
      "                !orderPaymentPending && order.items.length < authorisedKitQuantity;",
    ].join("\n"),
  );
}

const classAnchor = '                                  statusClasses(order.status),';
if (source.includes(classAnchor) && !source.includes('orderPaymentPending\n                                    ? "border-amber')) {
  source = source.replace(
    classAnchor,
    [
      "                                  orderPaymentPending",
      '                                    ? "border-amber-400/25 bg-amber-500/10 text-amber-100"',
      "                                    : orderNeedsCompletion",
      '                                      ? "border-sky-400/25 bg-sky-500/10 text-sky-100"',
      "                                      : statusClasses(order.status),",
    ].join("\n"),
  );
}

const labelAnchor = "                                {getTeamKitStatusLabel(order.status)}";
if (source.includes(labelAnchor) && !source.includes('? "Pending payment"')) {
  source = source.replace(
    labelAnchor,
    [
      "                                {orderPaymentPending",
      '                                  ? "Pending payment"',
      "                                  : orderNeedsCompletion",
      '                                    ? "Needs completion"',
      "                                    : getTeamKitStatusLabel(order.status)}",
    ].join("\n"),
  );
}

if (!source.includes("additional kit payment")) {
  const quantityMarker = [
    '                            <p className="mt-1 text-sm font-semibold text-sky-100/80">',
    '                              {order.kitQuantity} complete kit{order.kitQuantity === 1 ? "" : "s"}',
    "                            </p>",
  ].join("\n");
  const dateMarker = [
    '                            <p className="mt-1 text-xs text-white/35">',
    "                              Submitted: {formatDate(order.submittedAt)} · Last changed: {formatDate(order.updatedAt)}",
    "                            </p>",
  ].join("\n");
  const anchor = source.includes(quantityMarker) ? quantityMarker : dateMarker;
  if (!source.includes(anchor)) {
    throw new Error("Admin kit status explanation anchor was not found.");
  }
  const readinessCopy = [
    "                            {orderPaymentPending ? (",
    '                              <p className="mt-2 text-sm font-semibold text-amber-100/80">',
    "                                {pendingExtraKitQuantity} additional kit{pendingExtraKitQuantity === 1 ? \" has\" : \"s have\"} been requested but the complete additional kit payment has not been received yet. This order is not ready to place.",
    "                              </p>",
    "                            ) : orderNeedsCompletion ? (",
    '                              <p className="mt-2 text-sm font-semibold text-sky-100/80">',
    "                                Additional-kit payment is complete, but the paid kit details still need completing and resubmitting before this order is ready.",
    "                              </p>",
    "                            ) : null}",
  ].join("\n");
  source = source.replace(anchor, `${anchor}\n${readinessCopy}`);
}

if (!source.includes('orderPaymentPending\n                                  ? "Pending payment"')) {
  throw new Error("Admin kit pending-payment status was not applied.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log(
  "Admin kit orders now show Pending payment or Needs completion instead of a misleading Submitted badge when the full order is not ready.",
);
