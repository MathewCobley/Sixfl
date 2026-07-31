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
  '                        <div className="mt-2">\n                          <span',
  '                        {entry.payments.length > 0 ? (\n                          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-left">\n                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">\n                              Payment details\n                            </div>\n                            {entry.payments.map((payment) => (\n                              <div key={payment.id} className="text-xs leading-5 text-white/65">\n                                <span className="font-semibold text-white">{formatMoney(payment.amountPence)}</span>\n                                {` · ${payment.method.replaceAll("_", " ")} · ${formatUkDateTime(payment.paidAt)}`}\n                                {payment.reference ? ` · Ref ${payment.reference}` : ""}\n                                {payment.notes ? (\n                                  <div className="text-white/40">{payment.notes}</div>\n                                ) : null}\n                              </div>\n                            ))}\n                          </div>\n                        ) : null}\n                        <div className="mt-2">\n                          <span',
);

console.log("Applied detailed payment method and timestamp history to team charges.");
