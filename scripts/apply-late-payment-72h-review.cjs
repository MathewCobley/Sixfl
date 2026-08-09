const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = path.join(
  root,
  "src/app/(admin)/admin/fixtures/late-fees/actions.ts",
);
const pagePath = path.join(
  root,
  "src/app/(admin)/admin/fixtures/late-fees/page.tsx",
);

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

let actions = fs.readFileSync(actionsPath, "utf8");

// The review list should appear 72 hours after the actual fixture, rather than
// waiting seven days. Manual/non-fixture charges fall back to their due date.
actions = replaceRequired(
  actions,
  [
    '        CASE',
    '          WHEN charge."dueDate" IS NULL THEN NULL',
    '          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - charge."dueDate")) / 86400)::int',
    '        END AS "daysLate",',
  ].join("\n"),
  [
    '        CASE',
    '          WHEN COALESCE(fixture."kickoffAt", charge."dueDate") IS NULL THEN NULL',
    '          ELSE FLOOR(',
    '            EXTRACT(EPOCH FROM (NOW() - COALESCE(fixture."kickoffAt", charge."dueDate"))) / 86400',
    '          )::int',
    '        END AS "daysLate",',
  ].join("\n"),
  "72-hour review age calculation",
);

actions = replaceRequired(
  actions,
  [
    '    WHERE "outstandingPence" > 0',
    '      AND "daysLate" >= 7',
  ].join("\n"),
  [
    '    WHERE "outstandingPence" > 0',
    '      AND COALESCE("kickoffAt", "dueDate") IS NOT NULL',
    '      AND COALESCE("kickoffAt", "dueDate") + INTERVAL \'72 hours\' <= NOW()',
  ].join("\n"),
  "72-hour late-payment review filter",
);

fs.writeFileSync(actionsPath, actions, "utf8");

let page = fs.readFileSync(pagePath, "utf8");

page = replaceRequired(
  page,
  [
    "function PaymentLateFeeDecisionForm({",
    "  chargeId,",
    "  note,",
    "}: {",
    "  chargeId: string;",
    "  note: string | null;",
    "}) {",
  ].join("\n"),
  [
    "function PaymentLateFeeDecisionForm({",
    "  chargeId,",
    "  note,",
    "  canApplyFee,",
    "  lateFeeEligibleAt,",
    "}: {",
    "  chargeId: string;",
    "  note: string | null;",
    "  canApplyFee: boolean;",
    "  lateFeeEligibleAt: Date | null;",
    "}) {",
  ].join("\n"),
  "payment late-fee form eligibility props",
);

page = replaceRequired(
  page,
  [
    '        <button name="decision" value="APPLIED" className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">',
    "          Add £10",
    "        </button>",
  ].join("\n"),
  [
    '        <button',
    '          name="decision"',
    '          value="APPLIED"',
    '          disabled={!canApplyFee}',
    '          title={canApplyFee ? "Add the £10 late-payment admin fee" : `Available ${formatDate(lateFeeEligibleAt)}`}',
    '          className={cx(',
    '            "rounded-xl border px-3 py-2 text-xs font-semibold",',
    '            canApplyFee',
    '              ? "border-red-400/25 bg-red-500/10 text-red-100"',
    '              : "cursor-not-allowed border-white/10 bg-white/[0.03] text-white/30",',
    '          )}',
    "        >",
    '          {canApplyFee ? "Add £10" : "£10 not yet due"}',
    "        </button>",
  ].join("\n"),
  "disabled pre-7-day admin fee button",
);

page = replaceRequired(
  page,
  [
    "      </div>",
    "    </form>",
    "  );",
    "}",
    "",
    "function ConfirmationDecisionForm({",
  ].join("\n"),
  [
    "      </div>",
    "      {!canApplyFee ? (",
    '        <p className="text-xs leading-5 text-white/45">',
    "          This charge is now in the 72-hour review list. The £10 admin fee becomes",
    "          available after the existing 7-day grace period: {formatDate(lateFeeEligibleAt)}.",
    "          You can send a warning, waive or clear the decision before then.",
    "        </p>",
    "      ) : null}",
    "    </form>",
    "  );",
    "}",
    "",
    "function ConfirmationDecisionForm({",
  ].join("\n"),
  "72-hour review guidance",
);

page = replaceRequired(
  page,
  "  const auditItems = getPaymentLateFeeAuditItems(row);",
  [
    "  const auditItems = getPaymentLateFeeAuditItems(row);",
    "  const canApplyFee = Boolean(",
    "    row.lateFeeEligibleAt && row.lateFeeEligibleAt <= new Date(),",
    "  );",
  ].join("\n"),
  "payment late-fee eligibility state",
);

page = replaceRequired(
  page,
  '        <PaymentLateFeeDecisionForm chargeId={row.chargeId} note={row.paymentLateFeeNote} />',
  [
    "        <PaymentLateFeeDecisionForm",
    "          chargeId={row.chargeId}",
    "          note={row.paymentLateFeeNote}",
    "          canApplyFee={canApplyFee}",
    "          lateFeeEligibleAt={row.lateFeeEligibleAt}",
    "        />",
  ].join("\n"),
  "payment late-fee form call",
);

page = page
  .replace(
    "Manage payment admin fees for charges more than 7 days overdue and fixture confirmation fees for teams that miss the 72-hour confirmation deadline. Decisions stay manual so you can warn, apply, waive or clear fairly.",
    "Review outstanding fixture payments from 72 hours after kick-off and fixture confirmation fees for teams that miss the 72-hour confirmation deadline. The £10 payment admin fee still becomes eligible after the existing 7-day grace period, so decisions remain manual and fair.",
  )
  .replace(
    "Charges more than 7 days overdue.",
    "Outstanding charges shown from 72 hours after the fixture.",
  )
  .replace(
    "Fees paid more than 7 days late",
    "Outstanding payments more than 72 hours after the fixture",
  )
  .replace(
    "Use this section to manually add the £10 admin fee to the existing outstanding charge, waive it, or send a warning decision. Applying the fee increases the outstanding balance and resets any stale Stripe checkout session.",
    "Outstanding fixture charges appear here once 72 hours have passed after kick-off, so you can review or warn teams sooner. The £10 admin fee keeps the existing 7-day grace period; once eligible, applying it increases the outstanding balance and resets any stale Stripe checkout session. Manual charges use their due date when there is no fixture.",
  )
  .replace(
    "No payment charges are more than 7 days overdue.",
    "No outstanding payment charges are more than 72 hours past their fixture or due date.",
  );

if (
  actions.includes('AND "daysLate" >= 7') ||
  !actions.includes('INTERVAL \'72 hours\' <= NOW()') ||
  !actions.includes('COALESCE(fixture."kickoffAt", charge."dueDate")') ||
  page.includes("Fees paid more than 7 days late") ||
  page.includes("Charges more than 7 days overdue.") ||
  !page.includes("Outstanding payments more than 72 hours after the fixture") ||
  !page.includes("£10 not yet due") ||
  !page.includes("existing 7-day grace period")
) {
  throw new Error("Late-payment 72-hour review presentation was not applied correctly.");
}

fs.writeFileSync(pagePath, page, "utf8");
console.log(
  "Late-fee control centre now shows outstanding fixture payments after 72 hours while preserving the 7-day £10 admin-fee grace period.",
);
