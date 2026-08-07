const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const saveV2Path = "src/app/captain/team/[teamid]/kit/save-v2.ts";
const captainPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const formPath = "src/components/captain/TeamKitOrderForm.tsx";

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

let saveV2 = read(saveV2Path);
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
    "captain submit payment guard",
  );
}
write(saveV2Path, saveV2);

let captainPage = read(captainPagePath);
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
  }
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

captainPage = captainPage.replace(
  '          {extraKitPaymentSummary.pendingExtraKitQuantity} additional kit{extraKitPaymentSummary.pendingExtraKitQuantity === 1 ? " is" : "s are"} awaiting full payment. Its personalisation box will unlock only when the complete payment batch is paid.',
  '          {extraKitPaymentSummary.pendingExtraKitQuantity} additional kit{extraKitPaymentSummary.pendingExtraKitQuantity === 1 ? " is" : "s are"} awaiting payment. You can keep saving this order as a draft, but it cannot be submitted until the complete additional-kit payment batch is paid.',
);
write(captainPagePath, captainPage);

let form = read(formPath);
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
write(formPath, form);

const finalSave = read(saveV2Path);
const finalForm = read(formPath);
if (!finalSave.includes('error: "extra_kits_pending_payment"')) {
  throw new Error("Captain kit submit payment guard was not applied.");
}
if (!finalForm.includes('disabled={pendingExtraKitQuantity > 0}')) {
  throw new Error("Captain kit submit button payment guard was not applied.");
}

console.log(
  "Captain kit orders can be saved while extra-kit payments are pending, but cannot be submitted until those payments are complete.",
);
