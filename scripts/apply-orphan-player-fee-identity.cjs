const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function patchFile(relativePath, transform) {
  const absolutePath = path.join(root, relativePath);
  const before = fs.readFileSync(absolutePath, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(absolutePath, after, "utf8");
    console.log(`Patched ${relativePath}.`);
  } else {
    console.log(`${relativePath} already patched.`);
  }
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

patchFile("src/app/(admin)/admin/payments/page.tsx", (source) => {
  source = replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { getHistoricalPlayerFeeIdentities, type HistoricalPlayerFeeIdentity } from "@/lib/payments/player-fee-identity";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    "historical player-fee identity import",
  );

  source = replaceRequired(
    source,
    [
      "function getPlayerFeeName(input: {",
      "  teamMember: { user: { name: string | null; email: string | null } } | null;",
      "  prospect: {",
      "    firstName: string;",
      "    lastName: string | null;",
      "    email: string | null;",
      "    phone: string | null;",
      "  } | null;",
      "}) {",
      "  if (input.teamMember) {",
      '    return input.teamMember.user.name || input.teamMember.user.email || "Unnamed player";',
      "  }",
      "",
      "  if (input.prospect) {",
      "    return [input.prospect.firstName, input.prospect.lastName]",
      "      .filter(Boolean)",
      '      .join(" ")',
      "      .trim() || input.prospect.email || input.prospect.phone || \"Unnamed player\";",
      "  }",
      "",
      '  return "Unnamed player";',
      "}",
      "",
      "function getPlayerFeeContact(input: {",
      "  teamMember: { user: { email: string | null } } | null;",
      "  prospect: { email: string | null; phone: string | null } | null;",
      "}) {",
      '  if (input.teamMember) return input.teamMember.user.email || "No email";',
      "  if (input.prospect) {",
      '    return [input.prospect.email, input.prospect.phone].filter(Boolean).join(" · ") || "No contact";',
      "  }",
      '  return "No contact";',
      "}",
    ].join("\n"),
    [
      "function getPlayerFeeName(input: {",
      "  teamMember: { user: { name: string | null; email: string | null } } | null;",
      "  prospect: {",
      "    firstName: string;",
      "    lastName: string | null;",
      "    email: string | null;",
      "    phone: string | null;",
      "  } | null;",
      "  historicalIdentity: HistoricalPlayerFeeIdentity | null;",
      "}) {",
      "  if (input.teamMember) {",
      '    return input.teamMember.user.name || input.teamMember.user.email || "Player record without a name";',
      "  }",
      "",
      "  if (input.prospect) {",
      "    return [input.prospect.firstName, input.prospect.lastName]",
      "      .filter(Boolean)",
      '      .join(" ")',
      "      .trim() || input.prospect.email || input.prospect.phone || \"Player record without a name\";",
      "  }",
      "",
      "  return (",
      "    input.historicalIdentity?.displayName ||",
      "    input.historicalIdentity?.email ||",
      "    input.historicalIdentity?.phone ||",
      '    "Unlinked legacy player fee"',
      "  );",
      "}",
      "",
      "function getPlayerFeeContact(input: {",
      "  teamMember: { user: { email: string | null } } | null;",
      "  prospect: { email: string | null; phone: string | null } | null;",
      "  historicalIdentity: HistoricalPlayerFeeIdentity | null;",
      "}) {",
      '  if (input.teamMember) return input.teamMember.user.email || "No email";',
      "  if (input.prospect) {",
      '    return [input.prospect.email, input.prospect.phone].filter(Boolean).join(" · ") || "No contact";',
      "  }",
      "  return (",
      '    [input.historicalIdentity?.email, input.historicalIdentity?.phone].filter(Boolean).join(" · ") ||',
      '    "No historical contact found"',
      "  );",
      "}",
    ].join("\n"),
    "player fee identity helpers",
  );

  source = replaceRequired(
    source,
    [
      "  const playerPaymentDetailsById = new Map(",
      "    playerPaymentDetails.filter(Boolean).map((item) => [item!.id, item!]),",
      "  );",
      "  const openPlayerFees = openPlayerFeesRaw.map((fee) => ({",
      "    ...fee,",
      "    paymentUrl: playerPaymentDetailsById.get(fee.id)?.paymentUrl ?? fee.paymentUrl,",
      "  }));",
    ].join("\n"),
    [
      "  const playerPaymentDetailsById = new Map(",
      "    playerPaymentDetails.filter(Boolean).map((item) => [item!.id, item!]),",
      "  );",
      "  const orphanPlayerFeeIds = openPlayerFeesRaw",
      "    .filter((fee) => !fee.teamMember && !fee.prospect)",
      "    .map((fee) => fee.id);",
      "  const historicalPlayerFeeIdentities =",
      "    await getHistoricalPlayerFeeIdentities(orphanPlayerFeeIds);",
      "  const openPlayerFees = openPlayerFeesRaw.map((fee) => ({",
      "    ...fee,",
      "    paymentUrl: playerPaymentDetailsById.get(fee.id)?.paymentUrl ?? fee.paymentUrl,",
      "    historicalIdentity: historicalPlayerFeeIdentities.get(fee.id) ?? null,",
      "  }));",
    ].join("\n"),
    "historical player fee identity lookup",
  );

  source = source.replaceAll(
    "getPlayerFeeName({ teamMember: fee.teamMember, prospect: fee.prospect })",
    "getPlayerFeeName({ teamMember: fee.teamMember, prospect: fee.prospect, historicalIdentity: fee.historicalIdentity })",
  );
  source = source.replaceAll(
    "getPlayerFeeContact({ teamMember: fee.teamMember, prospect: fee.prospect })",
    "getPlayerFeeContact({ teamMember: fee.teamMember, prospect: fee.prospect, historicalIdentity: fee.historicalIdentity })",
  );

  source = replaceRequired(
    source,
    '                      <div className="mt-1 text-xs text-white/40">{playerContact}</div>\n                      <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fee.lastChasedAt ? "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100" : "border-white/10 bg-white/5 text-white/55"}`}>',
    [
      '                      <div className="mt-1 text-xs text-white/40">{playerContact}</div>',
      "                      {!fee.teamMember && !fee.prospect ? (",
      '                        <div className="mt-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-100/80">',
      "                          {fee.historicalIdentity ? (",
      "                            <>",
      '                              <span className="font-semibold text-sky-100">Identity recovered from the original payment request.</span>{" "}',
      "                              The linked squad/prospect record was later removed or merged.",
      "                            </>",
      "                          ) : (",
      "                            <>",
      '                              <span className="font-semibold text-sky-100">Legacy fee needs investigation.</span>{" "}',
      "                              No surviving squad link or historical recipient was found. Fee ID: {fee.id}",
      "                            </>",
      "                          )}",
      "                        </div>",
      "                      ) : null}",
      '                      <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fee.lastChasedAt ? "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100" : "border-white/10 bg-white/5 text-white/55"}`}>',
    ].join("\n"),
    "orphan player fee explanation",
  );

  if (source.includes("Unnamed player")) {
    throw new Error("Admin payments page still contains an Unnamed player fallback.");
  }

  return source;
});

patchFile("src/lib/payments/player-match-fees.ts", (source) => {
  source = replaceRequired(
    source,
    [
      "  const playerName = getPlayerName({",
      "    teamMember: fee.teamMember,",
      "    prospect: fee.prospect,",
      "  });",
      "  const email = fee.teamMember?.user.email?.trim() || fee.prospect?.email?.trim() || null;",
      "  let phone = getPhoneDisplayValue(fee.prospect?.phone ?? null);",
    ].join("\n"),
    [
      "  const historicalRecipient =",
      "    !fee.teamMember && !fee.prospect",
      "      ? await prisma.notificationRecipient.findFirst({",
      "          where: {",
      "            sourceType: NotificationRecipientSourceType.GENERAL,",
      "            sourceId: `player-match-fee:${fee.id}` ,",
      "          },",
      "          select: { displayName: true, email: true, phone: true },",
      "        })",
      "      : null;",
      "  const currentPlayerName = getPlayerName({",
      "    teamMember: fee.teamMember,",
      "    prospect: fee.prospect,",
      "  });",
      "  const playerName =",
      "    currentPlayerName !== \"Player\"",
      "      ? currentPlayerName",
      "      : historicalRecipient?.displayName?.trim() ||",
      "        historicalRecipient?.email?.trim() ||",
      "        historicalRecipient?.phone?.trim() ||",
      '        "Player";',
      "  const email =",
      "    fee.teamMember?.user.email?.trim() ||",
      "    fee.prospect?.email?.trim() ||",
      "    historicalRecipient?.email?.trim() ||",
      "    null;",
      "  let phone = getPhoneDisplayValue(",
      "    fee.prospect?.phone ?? historicalRecipient?.phone ?? null,",
      "  );",
    ].join("\n"),
    "historical reminder recipient fallback",
  );

  return source;
});

console.log(
  "Orphaned player fees now recover the original payment recipient and never display as an unnamed player.",
);
