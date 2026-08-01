const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected payment history source was not found in ${filePath}`);
  }
  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

replaceOnce(
  "src/lib/payments/team-payment-ledger.ts",
  '  isPayableNow: boolean;\n};',
  '  isPayableNow: boolean;\n  payments: Array<{\n    id: string;\n    amountPence: number;\n    method: string;\n    reference: string | null;\n    notes: string | null;\n    paidAt: Date;\n  }>;\n};',
);

replaceOnce(
  "src/lib/payments/team-payment-ledger.ts",
  '        transactions: { select: { amountPence: true, notes: true } },',
  '        transactions: {\n          orderBy: { paidAt: "asc" },\n          select: {\n            id: true,\n            amountPence: true,\n            method: true,\n            reference: true,\n            notes: true,\n            paidAt: true,\n          },\n        },',
);

replaceOnce(
  "src/lib/payments/team-payment-ledger.ts",
  '      displayStatus,\n      isPayableNow,\n    };',
  '      displayStatus,\n      isPayableNow,\n      payments: charge.transactions.map((transaction) => ({\n        id: transaction.id,\n        amountPence: transaction.amountPence,\n        method: transaction.method,\n        reference: transaction.reference,\n        notes: transaction.notes,\n        paidAt: transaction.paidAt,\n      })),\n    };',
);

replaceOnce(
  "src/app/captain/team/[teamid]/payments/page.tsx",
  '  const subscriptionMessage = getSubscriptionMessage(sp.subscription);',
  `  const fixtureIdsWithLedgerCharges = Array.from(
    new Set(
      ledger.entries
        .map((entry) => entry.fixtureId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const playerCollectionRows = fixtureIdsWithLedgerCharges.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: ledger.relatedTeamIds },
          fixtureId: { in: fixtureIdsWithLedgerCharges },
          status: { in: ["OPEN", "PAID", "WAIVED"] },
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          teamId: true,
          fixtureId: true,
          amountPence: true,
          status: true,
          paidAt: true,
          waivedAt: true,
          note: true,
          paymentUrl: true,
          teamMember: {
            select: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          prospect: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      })
    : [];
  const playerCollectionsByTeamFixture = new Map<
    string,
    Array<{
      id: string;
      name: string;
      contact: string | null;
      amountPence: number;
      statusLabel: string;
      statusMeta: string;
      tone: string;
    }>
  >();

  for (const fee of playerCollectionRows) {
    const key = \\`\${fee.teamId}:\${fee.fixtureId}\\`;
    const rows = playerCollectionsByTeamFixture.get(key) ?? [];
    const paidToCaptain =
      fee.status === "WAIVED" &&
      Boolean(fee.note?.includes("captain/organiser marked"));
    const statusLabel =
      fee.status === "PAID"
        ? "Paid online"
        : fee.status === "OPEN"
          ? "Awaiting payment"
          : paidToCaptain
            ? "Paid to captain"
            : fee.amountPence === 0
              ? "No charge"
              : "Waived";
    const statusMeta =
      fee.status === "PAID" && fee.paidAt
        ? \\`Paid \${formatUkDateTime(fee.paidAt)}\\`
        : paidToCaptain && fee.waivedAt
          ? \\`Recorded \${formatUkDateTime(fee.waivedAt)}\\`
          : fee.status === "OPEN"
            ? fee.paymentUrl
              ? "Payment link open"
              : "Awaiting payment link"
            : fee.waivedAt
              ? \\`Recorded \${formatUkDateTime(fee.waivedAt)}\\`
              : "Recorded in player collection";
    const tone =
      fee.status === "PAID" || paidToCaptain
        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
        : fee.status === "OPEN"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
          : "border-white/10 bg-white/[0.04] text-white/55";

    rows.push({
      id: fee.id,
      name: getPayerName({ teamMember: fee.teamMember, prospect: fee.prospect }),
      contact: getPayerContact({ teamMember: fee.teamMember, prospect: fee.prospect }),
      amountPence: fee.amountPence,
      statusLabel,
      statusMeta,
      tone,
    });
    playerCollectionsByTeamFixture.set(key, rows);
  }

  const subscriptionMessage = getSubscriptionMessage(sp.subscription);`,
);

replaceOnce(
  "src/app/captain/team/[teamid]/payments/page.tsx",
  '              const context = [entry.leagueName, entry.leagueSeason, entry.divisionName]\n                .filter(Boolean)\n                .join(" · ");',
  '              const context = [entry.leagueName, entry.leagueSeason, entry.divisionName]\n                .filter(Boolean)\n                .join(" · ");\n              const playerCollectionDetails = entry.fixtureId\n                ? playerCollectionsByTeamFixture.get(`${entry.teamId}:${entry.fixtureId}`) ?? []\n                : [];',
);

replaceOnce(
  "src/app/captain/team/[teamid]/payments/page.tsx",
  '                      <div className="mt-1 text-sm text-white/45">\n                        {entry.dueDate\n                          ? `Due ${formatPaymentFixtureDate(entry.dueDate)}`\n                          : entry.kickoffAt\n                            ? `Fixture ${formatPaymentFixtureDate(entry.kickoffAt)}`\n                            : "No due date set"}\n                      </div>\n                    </div>',
  `                      <div className="mt-1 text-sm text-white/45">
                        {entry.dueDate
                          ? \\`Due \${formatPaymentFixtureDate(entry.dueDate)}\\`
                          : entry.kickoffAt
                            ? \\`Fixture \${formatPaymentFixtureDate(entry.kickoffAt)}\\`
                            : "No due date set"}
                      </div>

                      {playerCollectionDetails.length > 0 ? (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left">
                          <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                            Player payment details
                          </div>
                          <div className="divide-y divide-white/10">
                            {playerCollectionDetails.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-white">{payment.name}</div>
                                  {payment.contact ? (
                                    <div className="mt-0.5 break-all text-xs text-white/45">
                                      {payment.contact}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                                  <div className="text-right">
                                    <div className="font-semibold text-white">
                                      {formatMoney(payment.amountPence)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/40">
                                      {payment.statusMeta}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                      payment.tone,
                                    ].join(" ")}
                                  >
                                    {payment.statusLabel}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : entry.playerPaidPence > 0 || entry.playerOpenPence > 0 ? (
                        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                          Player payment totals exist, but the individual records could not be matched to this fixture charge.
                        </div>
                      ) : null}
                    </div>`,
);

replaceOnce(
  "src/app/captain/team/[teamid]/payments/page.tsx",
  '                        <div className="mt-2">\n                          <span',
  '                        {entry.payments.length > 0 ? (\n                          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-left">\n                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">\n                              Direct team payment details\n                            </div>\n                            {entry.payments.map((payment) => (\n                              <div key={payment.id} className="text-xs leading-5 text-white/65">\n                                <span className="font-semibold text-white">{formatMoney(payment.amountPence)}</span>\n                                {` · ${payment.method.replaceAll("_", " ")} · ${formatUkDateTime(payment.paidAt)}`}\n                                {payment.reference ? ` · Ref ${payment.reference}` : ""}\n                                {payment.notes ? (\n                                  <div className="text-white/40">{payment.notes}</div>\n                                ) : null}\n                              </div>\n                            ))}\n                          </div>\n                        ) : null}\n                        <div className="mt-2">\n                          <span',
);

console.log(
  "Applied direct and player-level payment details to every team fixture charge.",
);
