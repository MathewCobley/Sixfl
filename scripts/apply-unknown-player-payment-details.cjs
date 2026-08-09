const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  source = source.replace(before, after);
}

// If a newer native payment page already contains the complete diagnostic UI,
// this script is deliberately a no-op. Build patches must be idempotent.
const alreadyApplied =
  source.includes("orphanRecipientByFeeId") &&
  source.includes("Temporary player payment") &&
  source.includes("Player record no longer linked") &&
  source.includes("Payment request sent to");

if (!alreadyApplied) {
  replaceRequired(
    '  return "Unknown player";',
    '  return "Unlinked player payment";',
    "unknown player label",
  );

  replaceRequired(
    [
      "  const selectedFees = selectedFixture",
      "    ? fees.filter((fee) => fee.fixtureId === selectedFixture.id)",
      "    : [];",
      "  const missingLinkIds = selectedFees",
    ].join("\n"),
    [
      "  const selectedFees = selectedFixture",
      "    ? fees.filter((fee) => fee.fixtureId === selectedFixture.id)",
      "    : [];",
      "  const orphanFeeIds = selectedFees",
      "    .filter((fee) => !fee.teamMember && !fee.prospect)",
      "    .map((fee) => fee.id);",
      "  const orphanDispatches = orphanFeeIds.length",
      "    ? await prisma.notificationDispatch.findMany({",
      "        where: {",
      "          sourceId: { in: orphanFeeIds },",
      "          sourceType: {",
      "            in: [",
      '              "PLAYER_MATCH_FEE_REQUEST",',
      '              "PLAYER_MATCH_FEE_CHASE_24H",',
      '              "PLAYER_MATCH_FEE_CHASE_72H",',
      "            ],",
      "          },",
      "        },",
      '        orderBy: [{ createdAt: "asc" }],',
      "        select: {",
      "          sourceId: true,",
      "          recipient: {",
      "            select: {",
      "              displayName: true,",
      "              email: true,",
      "              phone: true,",
      "            },",
      "          },",
      "        },",
      "      })",
      "    : [];",
      "  const orphanRecipientByFeeId = new Map<",
      "    string,",
      "    { displayName: string | null; email: string | null; phone: string | null }",
      "  >();",
      "  for (const dispatch of orphanDispatches) {",
      "    if (!dispatch.sourceId || orphanRecipientByFeeId.has(dispatch.sourceId)) continue;",
      "    orphanRecipientByFeeId.set(dispatch.sourceId, dispatch.recipient);",
      "  }",
      "  const missingLinkIds = selectedFees",
    ].join("\n"),
    "orphan payment recipient lookup",
  );

  const oldRendering = [
    "            {selectedFees.map((fee) => (",
    "              <div",
    "                key={fee.id}",
    '                className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"',
    "              >",
    "                <div>",
    '                  <div className="font-semibold text-white">{playerName(fee)}</div>',
    '                  <div className="mt-1 text-xs text-white/45">',
    "                    {formatMoney(fee.amountPence)} ·{\" \"}",
    '                    {fee.teamId === teamid ? "Current team" : "Historical team row"}',
    "                  </div>",
    "                </div>",
    "                <span",
    '                  className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(fee.status)}`}',
    "                >",
    "                  {statusLabel(fee.status, fee.note)}",
    "                </span>",
    "              </div>",
    "            ))}",
  ].join("\n");

  const newRendering = [
    "            {selectedFees.map((fee) => {",
    "              const isUnlinked = !fee.teamMember && !fee.prospect;",
    "              const isTemporaryPlayerPass =",
    "                isUnlinked &&",
    "                fee.note?.toLowerCase().includes(",
    '                  "temporary player joined using a player-created one-time pass",',
    "                );",
    "              const originalRecipient = orphanRecipientByFeeId.get(fee.id) ?? null;",
    "              const originalRecipientLabel = originalRecipient",
    "                ? [",
    "                    originalRecipient.displayName,",
    "                    originalRecipient.email,",
    "                    originalRecipient.phone,",
    "                  ]",
    "                    .filter(Boolean)",
    '                    .join(" · ")',
    "                : null;",
    "              const displayPlayerName = isTemporaryPlayerPass",
    '                ? "Temporary player"',
    "                : playerName(fee);",
    "",
    "              return (",
    "                <div",
    "                  key={fee.id}",
    '                  className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between"',
    "                >",
    '                  <div className="min-w-0">',
    '                    <div className="font-semibold text-white">{displayPlayerName}</div>',
    '                    <div className="mt-1 text-xs text-white/45">',
    "                      {formatMoney(fee.amountPence)} ·{\" \"}",
    '                      {fee.teamId === teamid ? "Current team" : "Historical team row"}',
    "                    </div>",
    "                    {isUnlinked ? (",
    '                      <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-50/80">',
    "                        {isTemporaryPlayerPass ? (",
    "                          <>",
    '                            <div className="font-semibold text-amber-100">Temporary player payment</div>',
    '                            <div className="mt-1">',
    "                              This fee was created when a temporary player joined this fixture using a one-time pass. Temporary players are not added to your permanent squad, so there is no squad player record attached to this payment.",
    "                            </div>",
    "                            {originalRecipientLabel ? (",
    '                              <div className="mt-1">Payment request sent to: {originalRecipientLabel}</div>',
    "                            ) : (",
    '                              <div className="mt-1">No payment request was sent for this fee.</div>',
    "                            )}",
    "                          </>",
    "                        ) : (",
    "                          <>",
    '                            <div className="font-semibold text-amber-100">Player record no longer linked</div>',
    '                            <div className="mt-1">',
    "                              The squad or prospect record originally linked to this payment has since been removed or merged. The fee remains here so the fixture payment history stays accurate.",
    "                            </div>",
    "                            {originalRecipientLabel ? (",
    '                              <div className="mt-1">Original payment recipient: {originalRecipientLabel}</div>',
    "                            ) : (",
    '                              <div className="mt-1">No payment request was sent, so there is no saved contact to display.</div>',
    "                            )}",
    "                            {fee.note ? (",
    '                              <div className="mt-1 text-amber-100/65">Note: {fee.note}</div>',
    "                            ) : null}",
    "                          </>",
    "                        )}",
    '                        <div className="mt-1 text-amber-100/55">',
    "                          Reference {fee.id.slice(-8).toUpperCase()} · created {formatDateTime(fee.createdAt)}",
    "                        </div>",
    "                      </div>",
    "                    ) : null}",
    "                  </div>",
    "                  <span",
    '                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(fee.status)}`}',
    "                  >",
    "                    {statusLabel(fee.status, fee.note)}",
    "                  </span>",
    "                </div>",
    "              );",
    "            })}",
  ].join("\n");

  replaceRequired(oldRendering, newRendering, "unlinked player payment explanation");
}

fs.writeFileSync(absolutePath, source, "utf8");

if (
  !source.includes("orphanRecipientByFeeId") ||
  !source.includes("Temporary player payment") ||
  !source.includes("Player record no longer linked") ||
  !source.includes("Payment request sent to") ||
  !source.includes("Reference {fee.id.slice(-8).toUpperCase()}") ||
  source.includes('return "Unknown player";')
) {
  throw new Error("Unlinked player payment details were not applied correctly.");
}

console.log(
  "Unlinked player payment rows are applied compatibly to the native squad-payment page.",
);
