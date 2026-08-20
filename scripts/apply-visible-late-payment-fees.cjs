const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`${label} anchor not found.`);
  }
  return source.replace(before, after);
}

// Keep applied late-payment fees in the admin query. They are split into a separate
// applied section in the page, rather than disappearing as soon as Add £10 is clicked.
{
  const file = "src/app/(admin)/admin/fixtures/late-fees/actions.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    `      WHERE charge."status" IN ('OPEN', 'PART_PAID')\n        AND charge."latePaymentFeeStatus" <> 'APPLIED'`,
    `      WHERE charge."status" IN ('OPEN', 'PART_PAID')`,
    "applied late-payment query visibility",
  );

  if (!source.includes('const PAYMENT_LATE_FEE_APPLIED_SOURCE_TYPE = "PAYMENT_LATE_FEE_APPLIED";')) {
    source = replaceRequired(
      source,
      'const PAYMENT_LATE_FEE_WARNING_SOURCE_TYPE = "PAYMENT_LATE_FEE_WARNING";',
      'const PAYMENT_LATE_FEE_WARNING_SOURCE_TYPE = "PAYMENT_LATE_FEE_WARNING";\nconst PAYMENT_LATE_FEE_APPLIED_SOURCE_TYPE = "PAYMENT_LATE_FEE_APPLIED";',
      "late-payment applied notification source type",
    );
  }

  if (!source.includes("async function queueLatePaymentAppliedEmail")) {
    const anchor = `  });\n}\n\nexport async function setLateConfirmationFeeDecisionAction`;
    const helper = `  });\n}\n\nasync function queueLatePaymentAppliedEmail(input: {\n  chargeId: string;\n  teamId: string;\n  teamName: string;\n  title: string;\n  description: string | null;\n  feeAmountPence: number;\n  amountPence: number;\n  paidTotalPence: number;\n  outstandingPence: number;\n  dueDate: Date | null;\n  paymentToken: string | null;\n  note: string | null;\n}) {\n  const { recipient, snapshot } = await upsertTeamNotificationRecipient(input.teamId);\n  const paymentUrl = buildPaymentUrl(input.paymentToken);\n  const baseChargePence = Math.max(0, input.amountPence - input.feeAmountPence);\n  const adminNote = input.note?.trim();\n  const body = [\n    \`Hi \${snapshot.primaryContact.name ?? snapshot.teamName},\`,\n    \"\",\n    \`A \${formatMoney(input.feeAmountPence)} late-payment admin fee has been applied to the outstanding SIXFL charge for \${input.teamName}.\`,\n    \"\",\n    input.title,\n    input.description ? input.description : null,\n    \`Due: \${formatDate(input.dueDate)}\`,\n    \`Original charge: \${formatMoney(baseChargePence)}\`,\n    \`Late-payment admin fee: \${formatMoney(input.feeAmountPence)}\`,\n    \`Total charge: \${formatMoney(input.amountPence)}\`,\n    \`Paid: \${formatMoney(input.paidTotalPence)}\`,\n    \`Outstanding: \${formatMoney(input.outstandingPence)}\`,\n    \"\",\n    \"The admin fee was added because the charge remained unpaid beyond the late-payment grace period.\",\n    adminNote ? \`Admin note: \${adminNote}\` : null,\n    \"\",\n    \"{{cta}}\",\n    \"\",\n    \"If you think this is incorrect, please contact SIXFL.\",\n  ]\n    .filter((line): line is string => line !== null)\n    .join(\"\\n\");\n\n  await queueDirectNotification({\n    recipientId: recipient.id,\n    channel: NotificationChannel.EMAIL,\n    audience: NotificationAudience.TEAM,\n    subject: \`SIXFL late-payment admin fee: \${input.teamName}\`,\n    body,\n    isTransactional: true,\n    sourceType: PAYMENT_LATE_FEE_APPLIED_SOURCE_TYPE,\n    sourceId: input.chargeId,\n    emailCta: input.paymentToken\n      ? {\n          label: \"Pay outstanding balance\",\n          url: paymentUrl,\n        }\n      : undefined,\n    metadata: {\n      chargeId: input.chargeId,\n      teamId: input.teamId,\n      teamName: input.teamName,\n      latePaymentFeePence: input.feeAmountPence,\n      totalChargePence: input.amountPence,\n      outstandingPence: input.outstandingPence,\n    },\n  });\n}\n\nexport async function setLateConfirmationFeeDecisionAction`;
    source = replaceRequired(source, anchor, helper, "late-payment applied email helper");
  }

  if (!source.includes("const nextOutstandingPence = Math.max(0, nextAmountPence - charge.paidTotalPence);")) {
    source = replaceRequired(
      source,
      `    const nextStatus = getChargeStatus({\n      amountPence: nextAmountPence,\n      paidTotalPence: charge.paidTotalPence,\n    });`,
      `    const nextStatus = getChargeStatus({\n      amountPence: nextAmountPence,\n      paidTotalPence: charge.paidTotalPence,\n    });\n    const nextOutstandingPence = Math.max(0, nextAmountPence - charge.paidTotalPence);`,
      "late-payment next outstanding total",
    );
  }

  if (!source.includes("Late-payment admin fee applied but team notification could not be queued")) {
    const warningAnchor = `    if (decision === "WARNING" && charge.latePaymentFeeStatus !== "WARNING") {`;
    const appliedNotice = `    if (!wasApplied && willBeApplied) {\n      try {\n        await queueLatePaymentAppliedEmail({\n          chargeId,\n          teamId: charge.teamId,\n          teamName: charge.teamName,\n          title: charge.title,\n          description: charge.description,\n          feeAmountPence,\n          amountPence: nextAmountPence,\n          paidTotalPence: charge.paidTotalPence,\n          outstandingPence: nextOutstandingPence,\n          dueDate: charge.dueDate,\n          paymentToken: charge.paymentToken,\n          note: decisionNote,\n        });\n      } catch (notificationError) {\n        // The financial decision is authoritative. A notification problem must never\n        // make a successfully applied £10 fee look as though the fee itself failed.\n        console.error(\n          \"Late-payment admin fee applied but team notification could not be queued\",\n          notificationError,\n        );\n      }\n    }\n\n${warningAnchor}`;
    source = replaceRequired(source, warningAnchor, appliedNotice, "late-payment applied team notification");
  }

  write(file, source);
}

// Split open late-payment cases from already-applied cases. Applied fees remain visible
// until their underlying charge is settled or the decision is changed.
{
  const file = "src/app/(admin)/admin/fixtures/late-fees/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    `  const notice = getNotice(resolvedSearchParams);\n  const paymentFeeOutstanding = paymentRows.reduce((sum, row) => sum + row.outstandingPence, 0);\n  const appliedPaymentFees = paymentRows.filter((row) => row.paymentLateFeeStatus === "APPLIED").length;`,
    `  const notice = getNotice(resolvedSearchParams);\n  const paymentReviewRows = paymentRows.filter((row) => row.paymentLateFeeStatus !== "APPLIED");\n  const appliedPaymentRows = paymentRows.filter((row) => row.paymentLateFeeStatus === "APPLIED");\n  const paymentFeeOutstanding = paymentReviewRows.reduce((sum, row) => sum + row.outstandingPence, 0);\n  const appliedPaymentFees = appliedPaymentRows.length;`,
    "late-payment review/applied row split",
  );

  source = source
    .replace(
      `          <div className="mt-3 text-3xl font-semibold text-white">{paymentRows.length}</div>\n          <p className="mt-2 text-sm text-red-100/70">Outstanding charges shown from 72 hours after the fixture.</p>`,
      `          <div className="mt-3 text-3xl font-semibold text-white">{paymentReviewRows.length}</div>\n          <p className="mt-2 text-sm text-red-100/70">Outstanding charges still needing a late-fee decision.</p>`,
    )
    .replace(
      `{paymentRows.length} charge{paymentRows.length === 1 ? "" : "s"}`,
      `{paymentReviewRows.length} charge{paymentReviewRows.length === 1 ? "" : "s"}`,
    )
    .replace(
      `{paymentRows.length === 0 ? <div`,
      `{paymentReviewRows.length === 0 ? <div`,
    )
    .replace(
      `{paymentRows.map((row) => <PaymentLateFeeRowCard key={row.chargeId} row={row} />)}`,
      `{paymentReviewRows.map((row) => <PaymentLateFeeRowCard key={row.chargeId} row={row} />)}`,
    );

  if (!source.includes("Applied £10 late-payment fees")) {
    const confirmationAnchor = `      <AdminCard className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">`;
    const appliedSection = `      <AdminCard className="space-y-5 rounded-3xl border border-red-400/20 bg-red-500/[0.04] p-5 md:p-6">\n        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">\n          <div>\n            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-100/70">Applied payment admin fees</p>\n            <h2 className="mt-3 text-2xl font-semibold text-white">Applied £10 late-payment fees</h2>\n            <p className="mt-2 max-w-3xl text-sm text-white/65">\n              Applied fees stay visible here while the charge is still unpaid. Each row shows the original charge, the £10 admin fee, the updated outstanding balance and the audit time. Applying a fee no longer makes the case disappear.\n            </p>\n          </div>\n          <span className="rounded-2xl border border-red-400/25 bg-black/20 px-4 py-3 text-sm font-semibold text-red-100">\n            {appliedPaymentRows.length} applied\n          </span>\n        </div>\n\n        {appliedPaymentRows.length === 0 ? (\n          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">\n            No unpaid £10 late-payment admin fees are currently applied.\n          </div>\n        ) : null}\n        <div className="space-y-4">\n          {appliedPaymentRows.map((row) => (\n            <PaymentLateFeeRowCard key={row.chargeId} row={row} />\n          ))}\n        </div>\n      </AdminCard>\n\n${confirmationAnchor}`;
    source = replaceRequired(source, confirmationAnchor, appliedSection, "applied late-payment fee section");
  }

  source = source.replace(
    `      message: \`Payment admin fee decision saved for \${teamName}.\`,`,
    `      message: \`Payment admin fee decision saved for \${teamName}. Applied £10 fees remain visible below and are included in the team's outstanding charge.\`,`,
  );

  write(file, source);
}

// Expose the fee composition in the captain ledger so a team never sees a match fee
// jump by £10 without an explanation.
{
  const file = "src/lib/payments/team-payment-ledger.ts";
  let source = read(file);

  if (!source.includes("latePaymentFeeStatus: string;")) {
    source = replaceRequired(
      source,
      `  description: string | null;\n  paymentToken: string | null;`,
      `  description: string | null;\n  latePaymentFeeStatus: string;\n  latePaymentFeeAmountPence: number;\n  paymentToken: string | null;`,
      "team ledger late-payment fee type",
    );
  }

  if (!source.includes("latePaymentFeeStatus: charge.latePaymentFeeStatus")) {
    source = replaceRequired(
      source,
      `      description: charge.description,\n      paymentToken: charge.paymentToken,`,
      `      description: charge.description,\n      latePaymentFeeStatus: charge.latePaymentFeeStatus,\n      latePaymentFeeAmountPence: charge.latePaymentFeeAmountPence,\n      paymentToken: charge.paymentToken,`,
      "team ledger late-payment fee values",
    );
  }

  write(file, source);
}

{
  const file = "src/app/captain/team/[teamid]/payments/page.tsx";
  let source = read(file);

  if (!source.includes("Late-payment admin fee applied")) {
    const descriptionAnchor = `                      <div className="mt-1 text-sm text-white/55">\n                        {entry.description || "No description"}\n                      </div>`;
    const lateFeeNotice = `${descriptionAnchor}\n\n                      {entry.latePaymentFeeStatus === "APPLIED" && entry.latePaymentFeeAmountPence > 0 ? (\n                        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100/85">\n                          <span className="font-semibold text-red-100">Late-payment admin fee applied:</span>{" "}\n                          base charge {formatMoney(Math.max(0, entry.amountPence - entry.latePaymentFeeAmountPence))} + {formatMoney(entry.latePaymentFeeAmountPence)} admin fee = {formatMoney(entry.amountPence)} total.\n                        </div>\n                      ) : null}`;
    source = replaceRequired(source, descriptionAnchor, lateFeeNotice, "captain late-payment fee explanation");
  }

  write(file, source);
}

console.log(
  "Applied late-payment admin fees remain visible, notify the team on first application, and show their £10 composition in the captain payment ledger.",
);
