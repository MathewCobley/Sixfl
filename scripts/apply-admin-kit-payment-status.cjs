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
  console.warn("Admin kit page is missing; readiness badge patch skipped.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('from "@/lib/kits/extra-kit-quantity"')) {
  const anchor = 'import { requireAdmin } from "@/lib/requireAdmin";';
  if (source.includes(anchor)) {
    source = source.replace(
      anchor,
      `import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\n${anchor}`,
    );
  }
}

if (!source.includes("extraKitPaymentByTeamId")) {
  const anchor = [
    "  const [allDesigns, orders] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    listAdminTeamKitOrders(),",
    "  ]);",
  ].join("\n");
  if (source.includes(anchor)) {
    source = source.replace(
      anchor,
      `${anchor}\n\n  const extraKitPaymentByTeamId = new Map(\n    await Promise.all(\n      orders.map(async (order) => [\n        order.teamId,\n        await getTeamExtraKitPaymentSummary(order.teamId),\n      ] as const),\n    ),\n  );`,
    );
  }
}

if (!source.includes("orderPaymentPending")) {
  const anchor =
    '              const sockSizes = countValues(order.items.map((item) => item.sockSize));';
  if (source.includes(anchor)) {
    source = source.replace(
      anchor,
      `${anchor}\n              const extraKitPaymentSummary = extraKitPaymentByTeamId.get(order.teamId);\n              const orderPaymentPending = (extraKitPaymentSummary?.pendingExtraKitQuantity ?? 0) > 0;\n              const orderNeedsCompletion = !orderPaymentPending && order.items.length < (extraKitPaymentSummary?.totalKitQuantity ?? order.kitQuantity);`,
    );
  }
}

if (
  source.includes("extraKitPaymentByTeamId") &&
  source.includes("orderPaymentPending") &&
  !source.includes('orderPaymentPending ? "Pending payment"')
) {
  source = source.replace(
    /\{getTeamKitStatusLabel\(order\.status\)\}/,
    '{orderPaymentPending ? "Pending payment" : orderNeedsCompletion ? "Needs completion" : getTeamKitStatusLabel(order.status)}',
  );
}

if (
  source.includes("orderPaymentPending") &&
  !source.includes('orderPaymentPending ? statusClasses("DRAFT")')
) {
  source = source.replace(
    /statusClasses\(order\.status\),/,
    'orderPaymentPending ? statusClasses("DRAFT") : orderNeedsCompletion ? statusClasses("SUBMITTED") : statusClasses(order.status),',
  );
}

fs.writeFileSync(filePath, source, "utf8");
console.log(
  source.includes('orderPaymentPending ? "Pending payment"')
    ? "Admin kit readiness badge applied."
    : "Admin kit readiness badge markers were not present; page left unchanged.",
);
