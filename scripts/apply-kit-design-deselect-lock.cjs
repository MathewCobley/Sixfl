const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const formPath = "src/components/captain/TeamKitOrderForm.tsx";
const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const actionPath = "src/app/captain/team/[teamid]/kit/actions.ts";

function absolute(filePath) {
  return path.join(root, filePath);
}

function read(filePath) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(absolute(filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function replaceAfterMarker(source, marker, before, after, label) {
  if (source.includes(after)) return source;

  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Expected marker for ${label} was not found.`);
  }

  const targetIndex = source.indexOf(before, markerIndex);
  if (targetIndex < 0) {
    throw new Error(`Expected ${label} source was not found after its marker.`);
  }

  return (
    source.slice(0, targetIndex) +
    after +
    source.slice(targetIndex + before.length)
  );
}

let form = read(formPath);

if (!form.includes("  designLocked: boolean;")) {
  form = replaceRequired(
    form,
    "  initialDesignId: string | null;\n",
    "  initialDesignId: string | null;\n  designLocked: boolean;\n",
    "kit design lock prop",
  );
}

if (!form.includes("  designLocked,\n")) {
  form = replaceRequired(
    form,
    "  initialDesignId,\n  initialItems,",
    "  initialDesignId,\n  designLocked,\n  initialItems,",
    "kit design lock prop destructuring",
  );
}

form = replaceRequired(
  form,
  [
    "            {!locked ? (",
    "              <input",
    '                type="search"',
  ].join("\n"),
  [
    "            {!designLocked ? (",
    "              <input",
    '                type="search"',
  ].join("\n"),
  "draft-only kit search",
);

form = replaceAfterMarker(
  form,
  "        {selectedDesign ? (",
  [
    "        {!locked ? (",
    '          <div className="p-4 sm:p-6">',
  ].join("\n"),
  [
    "        {!designLocked ? (",
    '          <div className="p-4 sm:p-6">',
  ].join("\n"),
  "draft-only kit catalogue",
);

form = replaceAfterMarker(
  form,
  "        {selectedDesign ? (",
  '            <div className="flex items-center gap-4">',
  '            <div className="flex flex-wrap items-center gap-4">',
  "selected kit layout",
);

const selectedDesignDetails = [
  '                <div className="mt-1 text-sm text-white/50">',
  '                  {selectedDesign.name ?? "Team kit"}',
  "                </div>",
  "              </div>",
].join("\n");

const selectedDesignDetailsWithAction = [
  selectedDesignDetails,
  "              {!designLocked ? (",
  "                <button",
  '                  type="button"',
  '                  onClick={() => setSelectedDesignId("")}',
  '                  className="ml-auto inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/35 hover:bg-red-500/15"',
  "                >",
  "                  Deselect kit",
  "                </button>",
  "              ) : (",
  '                <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/50">',
  "                  Design locked",
  "                </span>",
  "              )}",
].join("\n");

form = replaceAfterMarker(
  form,
  "        {selectedDesign ? (",
  selectedDesignDetails,
  selectedDesignDetailsWithAction,
  "selected kit deselect control",
);

if (!form.includes("{!designLocked ? (\n            <button\n              type=\"submit\"\n              name=\"intent\"\n              value=\"save\"")) {
  const saveButtonStartText = [
    "          <button",
    '            type="submit"',
    '            name="intent"',
    '            value="save"',
  ].join("\n");
  const saveButtonStart = form.indexOf(saveButtonStartText);

  if (saveButtonStart < 0) {
    throw new Error("Expected Save draft button was not found.");
  }

  const saveButtonEndText = "          </button>";
  const saveButtonEnd = form.indexOf(saveButtonEndText, saveButtonStart);

  if (saveButtonEnd < 0) {
    throw new Error("Expected end of Save draft button was not found.");
  }

  const saveButton = form.slice(
    saveButtonStart,
    saveButtonEnd + saveButtonEndText.length,
  );
  const wrappedSaveButton = [
    "          {!designLocked ? (",
    saveButton
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    "          ) : null}",
  ].join("\n");

  form =
    form.slice(0, saveButtonStart) +
    wrappedSaveButton +
    form.slice(saveButtonEnd + saveButtonEndText.length);
}

write(formPath, form);

let page = read(pagePath);

if (!page.includes("  const designLocked = Boolean(order && order.status !== \"DRAFT\");")) {
  const expandedLockBlock = [
    "  const locked = Boolean(",
    '    order && order.status !== "DRAFT" && !canExpandSubmittedOrder,',
    "  );",
  ].join("\n");
  const basicLockBlock =
    '  const locked = Boolean(order && order.status !== "DRAFT");';
  const designLockLine =
    '  const designLocked = Boolean(order && order.status !== "DRAFT");';

  if (page.includes(expandedLockBlock)) {
    page = page.replace(
      expandedLockBlock,
      `${expandedLockBlock}\n${designLockLine}`,
    );
  } else if (page.includes(basicLockBlock)) {
    page = page.replace(basicLockBlock, `${basicLockBlock}\n${designLockLine}`);
  } else {
    throw new Error("Expected team kit order lock calculation was not found.");
  }
}

if (!page.includes("          designLocked={designLocked}")) {
  page = replaceRequired(
    page,
    "          locked={locked}\n",
    "          designLocked={designLocked}\n          locked={locked}\n",
    "kit design lock form prop",
  );
}

write(pagePath, page);

let action = read(actionPath);

if (!action.includes("  const requestedKitDesignId = readString(formData, \"kitDesignId\");")) {
  action = replaceRequired(
    action,
    '  const kitDesignId = readString(formData, "kitDesignId");',
    [
      '  const requestedKitDesignId = readString(formData, "kitDesignId");',
      '  const designLocked = Boolean(existingOrder && existingOrder.status !== "DRAFT");',
      "  const kitDesignId = designLocked",
      '    ? existingOrder?.kitDesignId ?? ""',
      "    : requestedKitDesignId;",
    ].join("\n"),
    "server-side confirmed design lock",
  );
}

if (!action.includes('  const status = designLocked || intent === "submit"')) {
  action = replaceRequired(
    action,
    [
      '  const intent = readString(formData, "intent");',
      '  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";',
    ].join("\n"),
    [
      '  const intent = readString(formData, "intent");',
      "  // An order that has already left draft may be reopened only to add paid",
      "  // extra-kit details. It must not be downgraded to a draft, because that",
      "  // would make the confirmed design editable again.",
      '  const status = designLocked || intent === "submit"',
      '    ? "SUBMITTED"',
      '    : "DRAFT";',
    ].join("\n"),
    "confirmed order status preservation",
  );
}

write(actionPath, action);

const finalForm = read(formPath);
const finalPage = read(pagePath);
const finalAction = read(actionPath);

if (
  !finalForm.includes("Deselect kit") ||
  !finalForm.includes("Design locked") ||
  !finalForm.includes("{!designLocked ? (\n              <input") ||
  !finalForm.includes("{!designLocked ? (\n          <div className=\"p-4 sm:p-6\">") ||
  !finalPage.includes("designLocked={designLocked}") ||
  !finalAction.includes("const requestedKitDesignId") ||
  !finalAction.includes('const status = designLocked || intent === "submit"')
) {
  throw new Error("Kit design deselection and confirmed-order lock were not applied correctly.");
}

console.log(
  "Draft kit designs can be deselected, while submitted or approved orders keep their confirmed design locked.",
);
