const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const actionsPath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "kits",
  "actions.ts",
);
const pagePath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "kits",
  "page.tsx",
);

for (const file of [actionsPath, pagePath]) {
  if (!fs.existsSync(file)) throw new Error(`Required admin kit file missing: ${file}`);
}

let actions = fs.readFileSync(actionsPath, "utf8");
if (!actions.includes('from "@/lib/kits/extra-kit-quantity"')) {
  const anchor = 'import { isTeamKitOrderStatus } from "@/lib/kits/constants";';
  if (!actions.includes(anchor)) throw new Error("Admin kit status import anchor missing.");
  actions = actions.replace(
    anchor,
    `${anchor}\nimport { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";`,
  );
}

if (!actions.includes("KIT_EXTRA_PAYMENTS_PENDING")) {
  const anchor = '    if (status === "DRAFT") {';
  if (!actions.includes(anchor)) throw new Error("Admin kit status transition anchor missing.");
  const guard = [
    '    if (["SUBMITTED", "APPROVED", "ORDERED", "FULFILLED"].includes(status)) {',
    '      const [paymentSummary, readinessRows] = await Promise.all([',
    '        getTeamExtraKitPaymentSummary(teamId),',
    '        prisma.$queryRaw<Array<{ kitQuantity: number; rowCount: bigint }>>(Prisma.sql`',
    '          SELECT orders."kitQuantity", COUNT(items."id")::bigint AS "rowCount"',
    '          FROM "TeamKitOrder" orders',
    '          LEFT JOIN "TeamKitOrderItem" items ON items."orderId" = orders."id"',
    '          WHERE orders."id" = ${orderId}',
    '          GROUP BY orders."kitQuantity"',
    '        `),',
    '      ]);',
    '      const readiness = readinessRows[0];',
    '      if (paymentSummary.pendingExtraKitQuantity > 0) {',
    '        throw new Error("KIT_EXTRA_PAYMENTS_PENDING");',
    '      }',
    '      if (',
    '        !readiness ||',
    '        readiness.kitQuantity < paymentSummary.totalKitQuantity ||',
    '        Number(readiness.rowCount) < paymentSummary.totalKitQuantity',
    '      ) {',
    '        throw new Error("KIT_ORDER_INCOMPLETE");',
    '      }',
    '    }',
    '',
  ].join("\n");
  actions = actions.replace(anchor, `${guard}${anchor}`);
}

if (!actions.includes('error: "pending_extra_kit_payments"')) {
  const before = [
    '  } catch (error) {',
    '    console.error("Kit order status update failed", error);',
    '    redirect(redirectToKits({ error: "save_failed", team: teamName }));',
    '  }',
  ].join("\n");
  if (!actions.includes(before)) throw new Error("Admin kit status error handler anchor missing.");
  const after = [
    '  } catch (error) {',
    '    console.error("Kit order status update failed", error);',
    '    if (error instanceof Error && error.message === "KIT_EXTRA_PAYMENTS_PENDING") {',
    '      redirect(redirectToKits({ error: "pending_extra_kit_payments", team: teamName }));',
    '    }',
    '    if (error instanceof Error && error.message === "KIT_ORDER_INCOMPLETE") {',
    '      redirect(redirectToKits({ error: "order_incomplete", team: teamName }));',
    '    }',
    '    redirect(redirectToKits({ error: "save_failed", team: teamName }));',
    '  }',
  ].join("\n");
  actions = actions.replace(before, after);
}
fs.writeFileSync(actionsPath, actions, "utf8");

let page = fs.readFileSync(pagePath, "utf8");
if (!page.includes('case "pending_extra_kit_payments":')) {
  const anchor = [
    '    case "save_failed":',
    '      return "The change could not be saved. Please try again.";',
  ].join("\n");
  if (!page.includes(anchor)) throw new Error("Admin kit error copy anchor missing.");
  page = page.replace(
    anchor,
    [
      '    case "pending_extra_kit_payments":',
      '      return "This kit order still has additional kits awaiting payment. Save/reopen it as a draft; it cannot be submitted, approved or ordered yet.";',
      '    case "order_incomplete":',
      '      return "The extra-kit payment is complete, but all paid kit details must be completed and resubmitted before the order can move forward.";',
      anchor,
    ].join("\n"),
  );
}
fs.writeFileSync(pagePath, page, "utf8");

if (!actions.includes("KIT_EXTRA_PAYMENTS_PENDING") || !actions.includes("KIT_ORDER_INCOMPLETE")) {
  throw new Error("Admin kit readiness guards were not applied.");
}

console.log(
  "Admin cannot submit, approve, order or complete a kit order while extra-kit payments or paid-kit details are incomplete.",
);
