const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// Captain-facing form: acceptance is required only for final submission, not Save draft.
{
  const file = "src/components/captain/TeamKitOrderForm.tsx";
  let source = read(file);

  if (!source.includes('name="acceptKitTerms"')) {
    const anchor = `      {!locked ? (\n        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">`;
    const block = `      {!locked ? (\n        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 sm:p-6">\n          <label className="flex items-start gap-3 text-sm leading-6 text-white/75">\n            <input\n              type="checkbox"\n              name="acceptKitTerms"\n              className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/30"\n            />\n            <span>\n              I have checked the order details and agree to the current{\" \"}\n              <a\n                href="/founding-team-kit-terms"\n                target="_blank"\n                rel="noreferrer"\n                className="font-semibold text-emerald-200 underline underline-offset-2 hover:text-emerald-100"\n              >\n                Founding Team Kit Offer Terms\n              </a>\n              . This box is required when submitting the order; it is not required to save a draft.\n            </span>\n          </label>\n        </section>\n      ) : null}\n\n${anchor}`;

    if (!source.includes(anchor)) {
      throw new Error("Kit terms acceptance form anchor not found.");
    }
    source = source.replace(anchor, block);
  }

  write(file, source);
}

// Captain page: give a precise message when final submission is attempted without acceptance.
{
  const file = "src/app/captain/team/[teamid]/kit/page.tsx";
  let source = read(file);

  if (!source.includes('error === "kit_terms_required"')) {
    const anchor = `  if (error === "save_failed") {`;
    const insertion = `  if (error === "kit_terms_required") {\n    return "Please accept the current Founding Team Kit Offer Terms before submitting the order. You can still save the order as a draft without accepting them.";\n  }\n`;
    if (!source.includes(anchor)) {
      throw new Error("Kit terms error-message anchor not found.");
    }
    source = source.replace(anchor, `${insertion}${anchor}`);
  }

  write(file, source);
}

// Server action: server-side enforcement and immutable acceptance snapshot.
{
  const file = "src/app/captain/team/[teamid]/kit/save-v2.ts";
  let source = read(file);

  if (!source.includes('from "@/lib/kits/terms"')) {
    source = replaceRequired(
      source,
      'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\n',
      'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";\nimport { KIT_OFFER_TERMS_VERSION } from "@/lib/kits/terms";\n',
      "kit terms version import",
    );
  }

  if (!source.includes('error: "kit_terms_required"')) {
    const statusAnchor = `  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";\n`;
    const acceptanceGuard = `${statusAnchor}  const acceptedKitTerms = readString(formData, "acceptKitTerms") === "on";\n\n  if (status === "SUBMITTED" && !acceptedKitTerms) {\n    redirect(buildRedirect(teamId, { error: "kit_terms_required" }));\n  }\n`;
    source = replaceRequired(
      source,
      statusAnchor,
      acceptanceGuard,
      "kit terms submit status anchor",
    );
  }

  if (!source.includes('"kitTermsVersion" = CASE')) {
    source = replaceRequired(
      source,
      `            "submittedAt" = CASE\n              WHEN \${status} = 'SUBMITTED' THEN \${now}\n              ELSE NULL\n            END,\n            "approvedAt" = NULL,`,
      `            "submittedAt" = CASE\n              WHEN \${status} = 'SUBMITTED' THEN \${now}\n              ELSE NULL\n            END,\n            "kitTermsVersion" = CASE\n              WHEN \${status} = 'SUBMITTED' THEN \${KIT_OFFER_TERMS_VERSION}\n              ELSE "kitTermsVersion"\n            END,\n            "kitTermsAcceptedAt" = CASE\n              WHEN \${status} = 'SUBMITTED' THEN \${now}\n              ELSE "kitTermsAcceptedAt"\n            END,\n            "kitTermsAcceptedByUserId" = CASE\n              WHEN \${status} = 'SUBMITTED' THEN \${access.user?.id ?? null}\n              ELSE "kitTermsAcceptedByUserId"\n            END,\n            "approvedAt" = NULL,`,
      "existing order kit terms audit fields",
    );
  }

  if (!source.includes('"kitTermsVersion", "kitTermsAcceptedAt", "kitTermsAcceptedByUserId"')) {
    source = replaceRequired(
      source,
      `            "captainNotes", "submittedByUserId", "lastEditedByUserId",\n            "submittedAt", "createdAt", "updatedAt"\n          )`,
      `            "captainNotes", "submittedByUserId", "lastEditedByUserId",\n            "submittedAt", "kitTermsVersion", "kitTermsAcceptedAt",\n            "kitTermsAcceptedByUserId", "createdAt", "updatedAt"\n          )`,
      "new order kit terms columns",
    );

    source = replaceRequired(
      source,
      `            \${access.user?.id ?? null},\n            \${status === "SUBMITTED" ? now : null}, \${now}, \${now}\n          )`,
      `            \${access.user?.id ?? null},\n            \${status === "SUBMITTED" ? now : null},\n            \${status === "SUBMITTED" ? KIT_OFFER_TERMS_VERSION : null},\n            \${status === "SUBMITTED" ? now : null},\n            \${status === "SUBMITTED" ? access.user?.id ?? null : null},\n            \${now}, \${now}\n          )`,
      "new order kit terms values",
    );
  }

  write(file, source);
}

console.log("Kit Terms v2.2 acceptance and audit snapshot are applied.");
