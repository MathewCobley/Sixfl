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

if (!fs.existsSync(filePath)) throw new Error("Admin kit page is missing.");

let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('from "@/lib/kits/extra-kit-quantity"')) {
  const anchor = 'import { requireAdmin } from "@/lib/requireAdmin";';
  if (!source.includes(anchor)) throw new Error("Admin kit import anchor missing.");
  source = source.replace(
    anchor,
    `import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\n${anchor}`,
  );
}

if (!source.includes("extraKitPaymentByTeamId")) {
  const anchor = [
    "  const [allDesigns, orders] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    listAdminTeamKitOrders(),",
    "  ]);",
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("Admin kit orders query anchor missing.");
  source = source.replace(
    anchor,
    `${anchor}\n\n  const extraKitPaymentByTeamId = new Map(\n    await Promise.all(\n      orders.map(async (order) => [\n        order.teamId,\n        await getTeamExtraKitPaymentSummary(order.teamId),\n      ] as const),\n    ),\n  );`,
  );
}

if (!source.includes("orderPaymentPending")) {
  const anchor =
    '              const sockSizes = countValues(order.items.map((item) => item.sockSize));';
  if (!source.includes(anchor)) throw new Error("Admin kit order-loop anchor missing.");
  source = source.replace(
    anchor,
    `${anchor}\n              const extraKitPaymentSummary = extraKitPaymentByTeamId.get(order.teamId);\n              const orderPaymentPending = (extraKitPaymentSummary?.pendingExtraKitQuantity ?? 0) > 0;\n              const orderNeedsCompletion = !orderPaymentPending && order.items.length < (extraKitPaymentSummary?.totalKitQuantity ?? order.kitQuantity);`,
  );
}

if (!source.includes('orderPaymentPending ? "Pending payment"')) {
  const label = "{getTeamKitStatusLabel(order.status)}";
  if (!source.includes(label)) throw new Error("Admin kit status label anchor missing.");
  source = source.replace(
    label,
    '{orderPaymentPending ? "Pending payment" : orderNeedsCompletion ? "Needs completion" : getTeamKitStatusLabel(order.status)}',
  );
}

if (!source.includes("orderPaymentPending ? statusClasses")) {
  const classExpression = "statusClasses(order.status),";
  if (!source.includes(classExpression)) throw new Error("Admin kit status class anchor missing.");
  source = source.replace(
    classExpression,
    'orderPaymentPending ? statusClasses("DRAFT") : orderNeedsCompletion ? statusClasses("SUBMITTED") : statusClasses(order.status),',
  );
}

fs.writeFileSync(filePath, source, "utf8");
console.log(
  "Admin kit status badge reflects payment/completion readiness instead of raw submitted state.",
);
