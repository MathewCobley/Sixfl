const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
// The resilient repair action is now native in publish-actions.ts. Only the
// existing admin feedback presentation still needs compatibility preparation.
const pageFile = "src/app/(admin)/admin/fixtures/page.tsx";
const pageAbsolute = path.join(root, ...pageFile.split("/"));
let page = fs.readFileSync(pageAbsolute, "utf8");

page = page.replace(
  'getSearchParamValue(resolvedSearchParams.feeRepair) === "success"',
  '["success", "partial"].includes(getSearchParamValue(resolvedSearchParams.feeRepair) ?? "")',
);

if (!page.includes("feeRepairNotice.failed")) {
  page = page.replace(
    `          queued: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairQueued) ?? 0,\n          ),`,
    `          queued: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairQueued) ?? 0,\n          ),\n          failed: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairFailed) ?? 0,\n          ),\n          messageFailures: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairMessageFailures) ?? 0,\n          ),`,
  );

  page = page.replace(
    `Checked published fixture fees for {feeRepairNotice.fixtures} scheduled fixture{feeRepairNotice.fixtures === 1 ? "" : "s"}. {feeRepairNotice.charges} active team charge{feeRepairNotice.charges === 1 ? "" : "s"} now reconciled; {feeRepairNotice.queued} payment message{feeRepairNotice.queued === 1 ? "" : "s"} queued.`,
    `Checked published fixture fees for {feeRepairNotice.fixtures} scheduled fixture{feeRepairNotice.fixtures === 1 ? "" : "s"}. {feeRepairNotice.charges} active team charge{feeRepairNotice.charges === 1 ? "" : "s"} now reconciled; {feeRepairNotice.queued} payment message{feeRepairNotice.queued === 1 ? "" : "s"} queued.{feeRepairNotice.failed > 0 ? \` \${feeRepairNotice.failed} fixture\${feeRepairNotice.failed === 1 ? "" : "s"} could not be repaired and have been logged without stopping the others.\` : ""}{feeRepairNotice.messageFailures > 0 ? \` \${feeRepairNotice.messageFailures} payment-message batch\${feeRepairNotice.messageFailures === 1 ? "" : "es"} could not be queued; the fee charges themselves were still retained.\` : ""}`,
  );
}

fs.writeFileSync(pageAbsolute, page, "utf8");
console.log("Published fixture fee repair now continues past individual fee or messaging errors instead of crashing the admin page.");
