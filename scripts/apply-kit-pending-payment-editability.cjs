const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);

if (!fs.existsSync(pagePath)) {
  throw new Error("Captain kit page is missing.");
}

let source = fs.readFileSync(pagePath, "utf8");

if (!source.includes("hasPendingExtraKitPayments")) {
  const anchor = [
    '  const locked = Boolean(',
    '    order && order.status !== "DRAFT" && !canExpandSubmittedOrder,',
    '  );',
  ].join("\n");
  if (!source.includes(anchor)) {
    throw new Error("Captain kit lock-state anchor was not found.");
  }
  source = source.replace(
    anchor,
    [
      '  const hasPendingExtraKitPayments =',
      '    extraKitPaymentSummary.pendingExtraKitQuantity > 0;',
      '  const locked = Boolean(',
      '    order &&',
      '      order.status !== "DRAFT" &&',
      '      !canExpandSubmittedOrder &&',
      '      !hasPendingExtraKitPayments,',
      '  );',
    ].join("\n"),
  );
}

if (!source.includes('hasPendingExtraKitPayments ? "Pending payment"')) {
  source = source.replace(
    /\{order \? getTeamKitStatusLabel\(order\.status\) : "Not started"\}/,
    '{hasPendingExtraKitPayments ? "Pending payment" : order ? getTeamKitStatusLabel(order.status) : "Not started"}',
  );
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Kit orders with outstanding additional-kit payments stay editable for Save draft, while submission remains server-blocked.",
);
