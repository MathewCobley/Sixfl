const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = "src/app/(admin)/admin/fixtures/late-fees/actions.ts";
const pagePath = "src/app/(admin)/admin/fixtures/late-fees/page.tsx";

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

function patchFunction(source, startMarker, endMarker, patcher, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Expected ${label} start marker was not found.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Expected ${label} end marker was not found.`);

  const before = source.slice(0, start);
  const block = source.slice(start, end);
  const after = source.slice(end);
  return `${before}${patcher(block)}${after}`;
}

let actions = read(actionsPath);

if (!actions.includes("queueFixtureConfirmationWarningEmail")) {
  actions = replaceRequired(
    actions,
    'import { queueDirectNotification } from "@/lib/notifications/service";',
    [
      'import {',
      '  FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE,',
      '  queueFixtureConfirmationWarningEmail,',
      '} from "@/lib/fixtures/confirmation-warning-emails";',
      'import { processNotificationQueue } from "@/lib/notifications/processor";',
      'import { queueDirectNotification } from "@/lib/notifications/service";',
    ].join("\n"),
    "late-confirmation warning imports",
  );
}

if (!actions.includes('"late_fee_warning_sent"')) {
  actions = replaceRequired(
    actions,
    [
      '  | "late_fee_saved"',
      '  | "late_fee_error"',
      '  | "payment_late_fee_saved"',
    ].join("\n"),
    [
      '  | "late_fee_saved"',
      '  | "late_fee_error"',
      '  | "late_fee_warning_sent"',
      '  | "late_fee_warning_queued"',
      '  | "late_fee_warning_error"',
      '  | "payment_late_fee_saved"',
    ].join("\n"),
    "late-confirmation warning notices",
  );
}

actions = patchFunction(
  actions,
  "export async function setLateConfirmationFeeDecisionAction(formData: FormData)",
  "export async function setLatePaymentAdminFeeDecisionAction(formData: FormData)",
  (input) => {
    let block = input;

    if (!block.includes("const { user } = await requireAdmin();")) {
      block = replaceRequired(
        block,
        "  await requireAdmin();",
        "  const { user } = await requireAdmin();",
        "late-confirmation admin identity",
      );
    }

    if (!block.includes('let resultNotice: LateFeeNotice = "late_fee_saved";')) {
      block = replaceRequired(
        block,
        "  let teamName: string | null = null;",
        [
          "  let teamName: string | null = null;",
          '  let resultNotice: LateFeeNotice = "late_fee_saved";',
        ].join("\n"),
        "late-confirmation result notice",
      );
    }

    if (!block.includes("const warningRows = await prisma.$queryRaw")) {
      block = replaceRequired(
        block,
        "    await prisma.$executeRaw`",
        "    const warningRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`",
        "late-confirmation warning upsert result",
      );

      block = replaceRequired(
        block,
        [
          '        "updatedAt" = ${now}',
          "    `;",
          "",
          '    revalidatePath("/admin/fixtures");',
        ].join("\n"),
        [
          '        "updatedAt" = ${now}',
          '      RETURNING "id"',
          "    `);",
          "",
          "    const warningId = warningRows[0]?.id ?? null;",
          "",
          '    if (decision === "WARNING") {',
          "      if (!warningId) {",
          '        resultNotice = "late_fee_warning_error";',
          "      } else {",
          "        try {",
          "          const queuedWarning =",
          "            await queueFixtureConfirmationWarningEmail({",
          "              warningId,",
          "              fixtureId,",
          "              teamId,",
          "              teamName,",
          "              homeTeamName: fixture.homeTeam.name,",
          "              awayTeamName: fixture.awayTeam.name,",
          "              kickoffAt: fixture.kickoffAt,",
          "              confirmationStatus: confirmation?.status ?? null,",
          "              confirmedAt: confirmation?.confirmedAt ?? null,",
          "              adminNote: decisionNote,",
          "              createdByUserId: user?.id ?? null,",
          "            });",
          "",
          "          if (",
          '            queuedWarning.dispatchStatus === "QUEUED" ||',
          '            queuedWarning.dispatchStatus === "PROCESSING"',
          "          ) {",
          "            try {",
          "              await processNotificationQueue(10);",
          "            } catch (processingError) {",
          "              console.error(",
          '                "Failed to process formal confirmation warning immediately",',
          "                processingError,",
          "              );",
          "            }",
          "          }",
          "",
          "          const latestDispatch =",
          "            await prisma.notificationDispatch.findFirst({",
          "              where: {",
          "                sourceType:",
          "                  FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE,",
          "                sourceId: warningId,",
          '                channel: NotificationChannel.EMAIL,',
          "              },",
          "              select: { status: true },",
          '              orderBy: { createdAt: "desc" },',
          "            });",
          "",
          '          if (latestDispatch?.status === "SENT") {',
          '            resultNotice = "late_fee_warning_sent";',
          "          } else if (",
          '            latestDispatch?.status === "QUEUED" ||',
          '            latestDispatch?.status === "PROCESSING"',
          "          ) {",
          '            resultNotice = "late_fee_warning_queued";',
          "          } else {",
          '            resultNotice = "late_fee_warning_error";',
          "          }",
          "        } catch (warningError) {",
          "          console.error(",
          '            "Formal fixture confirmation warning could not be queued",',
          "            warningError,",
          "          );",
          '          resultNotice = "late_fee_warning_error";',
          "        }",
          "      }",
          "    }",
          "",
          '    revalidatePath("/admin/fixtures");',
        ].join("\n"),
        "immediate confirmation warning delivery",
      );
    }

    if (!block.includes("notice: resultNotice")) {
      block = replaceRequired(
        block,
        '  redirect(buildRedirect({ notice: "late_fee_saved", teamName, fixtureId }));',
        "  redirect(buildRedirect({ notice: resultNotice, teamName, fixtureId }));",
        "late-confirmation delivery result redirect",
      );
    }

    return block;
  },
  "late-confirmation decision action",
);

if (!actions.includes("warningEmailStatus: string | null;")) {
  actions = replaceRequired(
    actions,
    [
      "  decisionStatus: LateFeeDecision | null;",
      "  decisionNote: string | null;",
      "  historyWarnings: number;",
    ].join("\n"),
    [
      "  decisionStatus: LateFeeDecision | null;",
      "  decisionNote: string | null;",
      "  warningAt: Date | null;",
      "  warningEmailStatus: string | null;",
      "  warningEmailSentAt: Date | null;",
      "  warningEmailFailureReason: string | null;",
      "  historyWarnings: number;",
    ].join("\n"),
    "late-confirmation warning delivery row fields",
  );
}

if (!actions.includes('warning_dispatch."status"::text AS "warningEmailStatus"')) {
  actions = replaceRequired(
    actions,
    [
      '      fee."status"::text AS "decisionStatus",',
      '      fee."note" AS "decisionNote",',
      '      COALESCE(decision_counts."historyWarnings", 0)::int AS "historyWarnings",',
    ].join("\n"),
    [
      '      fee."status"::text AS "decisionStatus",',
      '      fee."note" AS "decisionNote",',
      '      fee."warningAt" AS "warningAt",',
      '      warning_dispatch."status"::text AS "warningEmailStatus",',
      '      warning_dispatch."sentAt" AS "warningEmailSentAt",',
      '      warning_dispatch."failureReason" AS "warningEmailFailureReason",',
      '      COALESCE(decision_counts."historyWarnings", 0)::int AS "historyWarnings",',
    ].join("\n"),
    "late-confirmation warning dispatch selection",
  );

  actions = replaceRequired(
    actions,
    [
      '    LEFT JOIN "FixtureConfirmationLateFee" fee',
      '      ON fee."fixtureId" = candidate."fixtureId"',
      '      AND fee."teamId" = candidate."teamId"',
      '    LEFT JOIN decision_counts ON decision_counts."teamId" = candidate."teamId"',
    ].join("\n"),
    [
      '    LEFT JOIN "FixtureConfirmationLateFee" fee',
      '      ON fee."fixtureId" = candidate."fixtureId"',
      '      AND fee."teamId" = candidate."teamId"',
      "    LEFT JOIN LATERAL (",
      "      SELECT",
      '        dispatch."status",',
      '        dispatch."sentAt",',
      '        dispatch."failureReason"',
      '      FROM "NotificationDispatch" dispatch',
      "      WHERE dispatch.\"sourceType\" =",
      "        ${FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE}",
      '        AND dispatch."sourceId" = fee."id"',
      "        AND dispatch.\"channel\"::text = 'EMAIL'",
      '      ORDER BY dispatch."createdAt" DESC',
      "      LIMIT 1",
      "    ) warning_dispatch ON true",
      '    LEFT JOIN decision_counts ON decision_counts."teamId" = candidate."teamId"',
    ].join("\n"),
    "late-confirmation warning dispatch join",
  );
}

write(actionsPath, actions);

let page = read(pagePath);

if (!page.includes('input.notice === "late_fee_warning_sent"')) {
  page = replaceRequired(
    page,
    [
      '  if (input.notice === "late_fee_saved") {',
      "    return {",
      '      tone: "success" as const,',
      "      message: `Confirmation fee decision saved for ${teamName}.`,",
      "    };",
      "  }",
    ].join("\n"),
    [
      '  if (input.notice === "late_fee_warning_sent") {',
      "    return {",
      '      tone: "success" as const,',
      "      message: `Formal confirmation warning sent to ${teamName}.`,",
      "    };",
      "  }",
      "",
      '  if (input.notice === "late_fee_warning_queued") {',
      "    return {",
      '      tone: "success" as const,',
      "      message: `Formal confirmation warning queued for ${teamName}. It will be sent by the notification runner shortly.`,",
      "    };",
      "  }",
      "",
      '  if (input.notice === "late_fee_warning_error") {',
      "    return {",
      '      tone: "error" as const,',
      "      message: `The warning decision was saved for ${teamName}, but the warning email could not be sent. Check the team contact and Delivery issues.`,",
      "    };",
      "  }",
      "",
      '  if (input.notice === "late_fee_saved") {',
      "    return {",
      '      tone: "success" as const,',
      "      message: `Confirmation fee decision saved for ${teamName}.`,",
      "    };",
      "  }",
    ].join("\n"),
    "late-confirmation warning result notices",
  );
}

page = page.split(">\n          Warning\n        </button>").join(
  ">\n          Send warning\n        </button>",
);

if (!page.includes("Optional admin note (included in a warning email)")) {
  page = replaceRequired(
    page,
    '        placeholder="Admin note"',
    '        placeholder="Optional admin note (included in a warning email)"',
    "late-confirmation warning note guidance",
  );
}

if (!page.includes("warningEmailStatus,")) {
  page = replaceRequired(
    page,
    [
      "  decisionStatus,",
      "  decisionNote,",
      "  historyWarnings,",
    ].join("\n"),
    [
      "  decisionStatus,",
      "  decisionNote,",
      "  warningAt,",
      "  warningEmailStatus,",
      "  warningEmailSentAt,",
      "  warningEmailFailureReason,",
      "  historyWarnings,",
    ].join("\n"),
    "late-confirmation warning delivery destructuring",
  );

  page = replaceRequired(
    page,
    [
      "  decisionStatus: string | null;",
      "  decisionNote: string | null;",
      "  historyWarnings: number;",
    ].join("\n"),
    [
      "  decisionStatus: string | null;",
      "  decisionNote: string | null;",
      "  warningAt: Date | null;",
      "  warningEmailStatus: string | null;",
      "  warningEmailSentAt: Date | null;",
      "  warningEmailFailureReason: string | null;",
      "  historyWarnings: number;",
    ].join("\n"),
    "late-confirmation warning delivery prop types",
  );

  page = replaceRequired(
    page,
    [
      '            <span className={cx("rounded-full border px-3 py-1", getDecisionTone(decisionStatus))}>',
      "              {getDecisionLabel(decisionStatus)}",
      "            </span>",
      "          </div>",
    ].join("\n"),
    [
      '            <span className={cx("rounded-full border px-3 py-1", getDecisionTone(decisionStatus))}>',
      "              {getDecisionLabel(decisionStatus)}",
      "            </span>",
      '            {decisionStatus === "WARNING" ? (',
      "              <span",
      "                title={warningEmailFailureReason ?? undefined}",
      "                className={cx(",
      '                  "rounded-full border px-3 py-1",',
      '                  warningEmailStatus === "SENT"',
      '                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"',
      '                    : warningEmailStatus === "QUEUED" ||',
      '                        warningEmailStatus === "PROCESSING" ||',
      "                        !warningEmailStatus",
      '                      ? "border-amber-400/25 bg-amber-500/10 text-amber-100"',
      '                      : "border-red-400/25 bg-red-500/10 text-red-100",',
      "                )}",
      "              >",
      '                {warningEmailStatus === "SENT"',
      '                  ? `Warning email sent ${formatDate(warningEmailSentAt ?? warningAt)}`',
      '                  : warningEmailStatus === "QUEUED" ||',
      '                      warningEmailStatus === "PROCESSING"',
      '                    ? "Warning email queued"',
      "                    : warningEmailStatus",
      '                      ? "Warning email failed"',
      '                      : "Warning recorded — email pending"}',
      "              </span>",
      "            ) : null}",
      "          </div>",
      '          {decisionStatus === "WARNING" &&',
      "          warningEmailStatus &&",
      '          ["FAILED", "SKIPPED", "CANCELLED"].includes(',
      "            warningEmailStatus,",
      "          ) ? (",
      "            <Link",
      '              href="/admin/delivery-issues"',
      '              className="mt-3 inline-flex text-xs font-semibold text-red-200 underline decoration-red-400/40 underline-offset-4"',
      "            >",
      "              Open delivery issues",
      "            </Link>",
      "          ) : null}",
    ].join("\n"),
    "late-confirmation warning delivery badge",
  );

  page = replaceRequired(
    page,
    [
      "              decisionStatus={row.decisionStatus}",
      "              decisionNote={row.decisionNote}",
      "              historyWarnings={row.historyWarnings}",
    ].join("\n"),
    [
      "              decisionStatus={row.decisionStatus}",
      "              decisionNote={row.decisionNote}",
      "              warningAt={row.warningAt}",
      "              warningEmailStatus={row.warningEmailStatus}",
      "              warningEmailSentAt={row.warningEmailSentAt}",
      "              warningEmailFailureReason={row.warningEmailFailureReason}",
      "              historyWarnings={row.historyWarnings}",
    ].join("\n"),
    "late-confirmation warning delivery props",
  );
}

write(pagePath, page);

const finalActions = read(actionsPath);
const finalPage = read(pagePath);

if (
  !finalActions.includes("queueFixtureConfirmationWarningEmail") ||
  !finalActions.includes("await processNotificationQueue(10)") ||
  !finalActions.includes('warning_dispatch."status"::text AS "warningEmailStatus"') ||
  !finalPage.includes("Formal confirmation warning sent to") ||
  !finalPage.includes("Warning email sent") ||
  !finalPage.includes("Send warning")
) {
  throw new Error(
    "Late-confirmation warning delivery and visibility did not apply correctly.",
  );
}

console.log(
  "Late-confirmation Warning now sends immediately and shows queued, sent or failed delivery status.",
);
