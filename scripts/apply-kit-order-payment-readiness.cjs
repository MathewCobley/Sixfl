const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const paths = {
  saveV2: "src/app/captain/team/[teamid]/kit/save-v2.ts",
  captainPage: "src/app/captain/team/[teamid]/kit/page.tsx",
  form: "src/components/captain/TeamKitOrderForm.tsx",
  adminPage: "src/app/(admin)/admin/kits/page.tsx",
  adminActions: "src/app/(admin)/admin/kits/actions.ts",
};

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, file), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// Captain submit: saving a draft is always allowed, but submitting is not.
let saveV2 = read(paths.saveV2);
if (!saveV2.includes('error: "extra_kits_pending_payment"')) {
  saveV2 = replaceRequired(
    saveV2,
    [
      '  const intent = readString(formData, "intent");',
      '  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";',
    ].join("\n"),
    [
      '  const intent = readString(formData, "intent");',
      '  if (intent === "submit" && paymentSummary.pendingExtraKitQuantity > 0) {',
      '    redirect(buildRedirect(teamId, { error: "extra_kits_pending_payment" }));',
      '  }',
      '  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";',
    ].join("\n"),
    "temporary extra-kit payment submit guard",
  );
}
write(paths.saveV2, saveV2);

// Captain page: show the real readiness state and keep an old premature submission editable.
let captainPage = read(paths.captainPage);
if (!captainPage.includes('error === "extra_kits_pending_payment"')) {
  captainPage = replaceRequired(
    captainPage,
    '  if (error === "duplicate_numbers") {',
    [
      '  if (error === "extra_kits_pending_payment") {',
      '    return "You can save this order as a draft, but it cannot be submitted until all requested additional kits have been paid for.";',
      '  }',
      '  if (error === "duplicate_numbers") {',
    ].join("\n"),
    "captain pending-payment error message",
  );
}

if (captainPage.includes("extraKitPaymentSummary") && !captainPage.includes("hasPendingExtraKitPayments")) {
  captainPage = replaceRequired(
    captainPage,
    [
      '  const locked = Boolean(',
      '    order && order.status !== "DRAFT" && !canExpandSubmittedOrder,',
      '  );',
    ].join("\n"),
    [
      '  const hasPendingExtraKitPayments =',
      '    extraKitPaymentSummary.pendingExtraKitQuantity > 0;',
      '  const locked = Boolean(',
      '    order &&',
      '      order.status !== "DRAFT" &&',
      '      !canExpandSubmittedOrder &&',
      '      !(order.status === "SUBMITTED" && hasPendingExtraKitPayments),',
      '  );',
    ].join("\n"),
    "captain pending-payment editable state",
  );
}

if (captainPage.includes("hasPendingExtraKitPayments")) {
  captainPage = captainPage.replace(
    '              statusClasses(order?.status ?? "DRAFT"),',
    '              hasPendingExtraKitPayments\n                ? "border-amber-400/25 bg-amber-500/10 text-amber-100"\n                : statusClasses(order?.status ?? "DRAFT"),',
  );
  captainPage = captainPage.replace(
    '            {order ? getTeamKitStatusLabel(order.status) : "Not started"}',
    '            {hasPendingExtraKitPayments\n              ? "Pending payment"\n              : order\n                ? getTeamKitStatusLabel(order.status)\n                : "Not started"}',
  );
}

if (
  captainPage.includes("extraKitPaymentSummary") &&
  !captainPage.includes("pendingExtraKitQuantity={extraKitPaymentSummary.pendingExtraKitQuantity}")
) {
  const dynamicIncluded = '          includedKitQuantity={includedKitQuantity}\n';
  const fixedIncluded = '          includedKitQuantity={TEAM_KIT_QUANTITY}\n';
  if (captainPage.includes(dynamicIncluded)) {
    captainPage = captainPage.replace(
      dynamicIncluded,
      `${dynamicIncluded}          pendingExtraKitQuantity={extraKitPaymentSummary.pendingExtraKitQuantity}\n`,
    );
  } else if (captainPage.includes(fixedIncluded)) {
    captainPage = captainPage.replace(
      fixedIncluded,
      `${fixedIncluded}          pendingExtraKitQuantity={extraKitPaymentSummary.pendingExtraKitQuantity}\n`,
    );
  } else {
    throw new Error("Expected captain kit quantity prop was not found.");
  }
}

captainPage = captainPage.replace(
  '          {extraKitPaymentSummary.pendingExtraKitQuantity} additional kit{extraKitPaymentSummary.pendingExtraKitQuantity === 1 ? " is" : "s are"} awaiting full payment. Its personalisation box will unlock only when the complete payment batch is paid.',
  '          {extraKitPaymentSummary.pendingExtraKitQuantity} additional kit{extraKitPaymentSummary.pendingExtraKitQuantity === 1 ? " is" : "s are"} awaiting payment. You can keep saving this order as a draft, but it cannot be submitted until the complete additional-kit payment batch is paid.',
);
write(paths.captainPage, captainPage);

// Captain form: keep Save draft enabled while preventing a misleading submit.
let form = read(paths.form);
if (!form.includes("pendingExtraKitQuantity?: number;")) {
  form = replaceRequired(
    form,
    '  locked: boolean;\n',
    '  pendingExtraKitQuantity?: number;\n  locked: boolean;\n',
    "pending kit payment form prop",
  );
}
if (!form.includes("pendingExtraKitQuantity = 0,")) {
  form = replaceRequired(
    form,
    '  locked,\n  action,',
    '  pendingExtraKitQuantity = 0,\n  locked,\n  action,',
    "pending kit payment form destructuring",
  );
}
if (!form.includes("Additional-kit payments are still outstanding")) {
  form = replaceRequired(
    form,
    '      {!locked ? (\n        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">',
    [
      '      {!locked && pendingExtraKitQuantity > 0 ? (',
      '        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">',
      '          <span className="font-semibold">Additional-kit payments are still outstanding.</span>{" "}',
      '          You can save your work now, but Submit kit order will unlock only when all requested additional kits have been paid for.',
      '        </div>',
      '      ) : null}',
      '',
      '      {!locked ? (',
      '        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">',
    ].join("\n"),
    "pending kit payment form notice",
  );
}
if (!form.includes('disabled={pendingExtraKitQuantity > 0}')) {
  form = replaceRequired(
    form,
    '            value="submit"\n            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"',
    '            value="submit"\n            disabled={pendingExtraKitQuantity > 0}\n            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"',
    "disabled submit button while kit payments are pending",
  );
}
write(paths.form, form);

// Admin page: a premature raw SUBMITTED status must display its actual readiness.
let adminPage = read(paths.adminPage);
if (!adminPage.includes('from "@/lib/kits/extra-kit-quantity"')) {
  adminPage = replaceRequired(
    adminPage,
    'import { requireAdmin } from "@/lib/requireAdmin";',
    'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\nimport { requireAdmin } from "@/lib/requireAdmin";',
    "admin extra-kit payment summary import",
  );
}
if (!adminPage.includes("extraKitPaymentByTeamId")) {
  adminPage = replaceRequired(
    adminPage,
    '  const filteredDesigns = q\n',
    [
      '  const extraKitPaymentByTeamId = new Map(',
      '    await Promise.all(',
      '      orders.map(async (order) => [',
      '        order.teamId,',
      '        await getTeamExtraKitPaymentSummary(order.teamId),',
      '      ] as const),',
      '    ),',
      '  );',
      '',
      '  const filteredDesigns = q',
    ].join("\n"),
    "admin extra-kit payment summary map",
  );
}

if (!adminPage.includes('error === "pending_extra_kit_payments"') && !adminPage.includes('case "pending_extra_kit_payments"')) {
  adminPage = replaceRequired(
    adminPage,
    '    case "save_failed":\n      return "The change could not be saved. Please try again.";',
    [
      '    case "pending_extra_kit_payments":',
      '      return "This order still has additional kits awaiting payment. It cannot move forward yet.";',
      '    case "order_incomplete":',
      '      return "Additional kits have been paid for but their kit details have not all been completed and resubmitted yet.";',
      '    case "save_failed":',
      '      return "The change could not be saved. Please try again.";',
    ].join("\n"),
    "admin kit readiness error messages",
  );
}

if (!adminPage.includes("orderPaymentPending")) {
  adminPage = replaceRequired(
    adminPage,
    '              const sockSizes = countValues(order.items.map((item) => item.sockSize));\n',
    [
      '              const sockSizes = countValues(order.items.map((item) => item.sockSize));',
      '              const extraPaymentSummary = extraKitPaymentByTeamId.get(order.teamId);',
      '              const pendingExtraKitQuantity =',
      '                extraPaymentSummary?.pendingExtraKitQuantity ?? 0;',
      '              const authorisedKitQuantity =',
      '                extraPaymentSummary?.totalKitQuantity ?? order.kitQuantity;',
      '              const orderPaymentPending = pendingExtraKitQuantity > 0;',
      '              const orderNeedsCompletion =',
      '                !orderPaymentPending &&',
      '                (order.kitQuantity < authorisedKitQuantity ||',
      '                  order.items.length < authorisedKitQuantity);',
      '',
    ].join("\n"),
    "admin per-order kit readiness state",
  );
}

adminPage = adminPage.replace(
  '                                  statusClasses(order.status),',
  '                                  orderPaymentPending\n                                    ? "border-amber-400/25 bg-amber-500/10 text-amber-100"\n                                    : orderNeedsCompletion\n                                      ? "border-sky-400/25 bg-sky-500/10 text-sky-100"\n                                      : statusClasses(order.status),',
);
adminPage = adminPage.replace(
  '                                {getTeamKitStatusLabel(order.status)}',
  '                                {orderPaymentPending\n                                  ? "Pending payment"\n                                  : orderNeedsCompletion\n                                    ? "Needs completion"\n                                    : getTeamKitStatusLabel(order.status)}',
);

if (!adminPage.includes("additional kit payment")) {
  adminPage = replaceRequired(
    adminPage,
    [
      '                            <p className="mt-1 text-xs text-white/35">',
      '                              Submitted: {formatDate(order.submittedAt)} · Last changed: {formatDate(order.updatedAt)}',
      '                            </p>',
    ].join("\n"),
    [
      '                            {orderPaymentPending ? (',
      '                              <p className="mt-2 text-sm font-semibold text-amber-100/80">',
      '                                {pendingExtraKitQuantity} additional kit{pendingExtraKitQuantity === 1 ? " is" : "s are"} awaiting payment. {order.items.length} kit{order.items.length === 1 ? " is" : "s are"} currently ready.',
      '                              </p>',
      '                            ) : orderNeedsCompletion ? (',
      '                              <p className="mt-2 text-sm font-semibold text-sky-100/80">',
      '                                Payment is complete, but {authorisedKitQuantity - order.items.length} paid kit{authorisedKitQuantity - order.items.length === 1 ? " still needs" : "s still need"} completing before this order can be submitted.',
      '                              </p>',
      '                            ) : null}',
      '                            <p className="mt-1 text-xs text-white/35">',
      '                              {orderPaymentPending',
      '                                ? `Pending payment · Last changed: ${formatDate(order.updatedAt)}`',
      '                                : orderNeedsCompletion',
      '                                  ? `Needs completion · Last changed: ${formatDate(order.updatedAt)}`',
      '                                  : `Submitted: ${formatDate(order.submittedAt)} · Last changed: ${formatDate(order.updatedAt)}`}',
      '                            </p>',
    ].join("\n"),
    "admin kit readiness explanation",
  );
}

if (!adminPage.includes("orderPaymentPending || orderNeedsCompletion ? (")) {
  adminPage = replaceRequired(
    adminPage,
    [
      '                          <StatusButton order={order} status="DRAFT" label="Reopen draft" />',
      '                          <StatusButton order={order} status="SUBMITTED" label="Mark submitted" />',
      '                          <StatusButton order={order} status="APPROVED" label="Approve" />',
      '                          <StatusButton order={order} status="ORDERED" label="Mark ordered" />',
      '                          <StatusButton order={order} status="FULFILLED" label="Complete" />',
      '                          <StatusButton order={order} status="CANCELLED" label="Cancel" />',
    ].join("\n"),
    [
      '                          {orderPaymentPending || orderNeedsCompletion ? (',
      '                            <>',
      '                              <StatusButton order={order} status="DRAFT" label="Reopen draft" />',
      '                              <StatusButton order={order} status="CANCELLED" label="Cancel" />',
      '                            </>',
      '                          ) : (',
      '                            <>',
      '                              <StatusButton order={order} status="DRAFT" label="Reopen draft" />',
      '                              <StatusButton order={order} status="SUBMITTED" label="Mark submitted" />',
      '                              <StatusButton order={order} status="APPROVED" label="Approve" />',
      '                              <StatusButton order={order} status="ORDERED" label="Mark ordered" />',
      '                              <StatusButton order={order} status="FULFILLED" label="Complete" />',
      '                              <StatusButton order={order} status="CANCELLED" label="Cancel" />',
      '                            </>',
      '                          )}',
    ].join("\n"),
    "admin kit readiness workflow controls",
  );
}
write(paths.adminPage, adminPage);

// Admin server action: UI state cannot be bypassed to approve an incomplete order.
let adminActions = read(paths.adminActions);
if (!adminActions.includes('from "@/lib/kits/extra-kit-quantity"')) {
  adminActions = replaceRequired(
    adminActions,
    'import { isTeamKitOrderStatus } from "@/lib/kits/constants";',
    'import { isTeamKitOrderStatus } from "@/lib/kits/constants";\nimport { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
    "admin kit readiness summary import",
  );
}
if (!adminActions.includes("KIT_EXTRA_PAYMENTS_PENDING")) {
  adminActions = replaceRequired(
    adminActions,
    '    if (status === "DRAFT") {',
    [
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
      '    if (status === "DRAFT") {',
    ].join("\n"),
    "admin kit readiness transition guard",
  );
}
if (!adminActions.includes('error: "pending_extra_kit_payments"')) {
  adminActions = replaceRequired(
    adminActions,
    '  } catch (error) {\n    console.error("Kit order status update failed", error);\n    redirect(redirectToKits({ error: "save_failed", team: teamName }));\n  }',
    [
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
    ].join("\n"),
    "admin kit readiness error routing",
  );
}
write(paths.adminActions, adminActions);

const finalSources = Object.fromEntries(
  Object.entries(paths).map(([key, file]) => [key, read(file)]),
);
const requiredMarkers = [
  [finalSources.saveV2, 'error: "extra_kits_pending_payment"', "captain submit payment guard"],
  [finalSources.form, "Additional-kit payments are still outstanding", "captain pending-payment notice"],
  [finalSources.form, 'disabled={pendingExtraKitQuantity > 0}', "captain disabled submit"],
  [finalSources.adminPage, '"Pending payment"', "admin pending-payment status"],
  [finalSources.adminPage, '"Needs completion"', "admin needs-completion status"],
  [finalSources.adminActions, "KIT_EXTRA_PAYMENTS_PENDING", "admin payment transition guard"],
  [finalSources.adminActions, "KIT_ORDER_INCOMPLETE", "admin completion transition guard"],
];

for (const [source, marker, label] of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`Kit order readiness marker missing: ${label}.`);
  }
}

console.log(
  "Kit orders can be saved while extra-kit payments are pending, but cannot be submitted, approved or ordered until every requested kit is paid and fully completed.",
);
