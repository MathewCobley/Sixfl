const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/leads/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

const quickSendImport =
  'import LeadConfirmationQuickSendButton from "@/components/admin/leads/LeadConfirmationQuickSendButton";';
const chaseImport =
  'import LeadConfirmationChaseButton from "@/components/admin/leads/LeadConfirmationChaseButton";';

if (!source.includes(chaseImport)) {
  if (!source.includes(quickSendImport)) {
    throw new Error("Lead confirmation quick-send import was not found.");
  }
  source = source.replace(quickSendImport, `${quickSendImport}\n${chaseImport}`);
}

const confirmationTypeMarker = [
  "type TeamConfirmationRow = {",
  "  leadId: string;",
  "  status: string;",
  "  sentAt: Date | null;",
  "  confirmedAt: Date | null;",
  "  declinedAt: Date | null;",
  "};",
].join("\n");

const deliveryTypeBlock = [
  confirmationTypeMarker,
  "",
  "type TeamConfirmationDeliveryRow = {",
  "  leadId: string;",
  "  dispatchStatus: string;",
  "  providerStatus: string | null;",
  "  sentAt: Date | null;",
  "  failedAt: Date | null;",
  "  failureReason: string | null;",
  "  createdAt: Date;",
  "};",
].join("\n");

if (!source.includes("type TeamConfirmationDeliveryRow =")) {
  if (!source.includes(confirmationTypeMarker)) {
    throw new Error("Team confirmation row type was not found.");
  }
  source = source.replace(confirmationTypeMarker, deliveryTypeBlock);
}

const deliveryFunctionMarker = "function statusClasses(status: LeadStatus) {";
const deliveryFunction = [
  "function getTeamConfirmationDeliveryMeta(",
  "  row: TeamConfirmationDeliveryRow | null | undefined,",
  ") {",
  "  if (!row) return null;",
  "",
  '  const provider = (row.providerStatus ?? "").toUpperCase();',
  "  const detail = row.failureReason || row.providerStatus || row.dispatchStatus;",
  "",
  '  if (provider.startsWith("BOUNCED")) {',
  '    return { label: "Email bounced", className: "border-red-400/25 bg-red-500/10 text-red-200", detail };',
  "  }",
  '  if (provider.startsWith("COMPLAINED") || provider.startsWith("SUPPRESSED")) {',
  '    return { label: "Email blocked", className: "border-red-400/25 bg-red-500/10 text-red-200", detail };',
  "  }",
  '  if (provider.startsWith("FAILED") || row.dispatchStatus === "FAILED") {',
  '    return { label: "Email failed", className: "border-red-400/25 bg-red-500/10 text-red-200", detail };',
  "  }",
  '  if (provider.startsWith("CLICKED")) {',
  '    return { label: "Email clicked", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200", detail };',
  "  }",
  '  if (provider.startsWith("OPENED")) {',
  '    return { label: "Email opened", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200", detail };',
  "  }",
  '  if (provider.startsWith("DELIVERED")) {',
  '    return { label: "Email delivered", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200", detail };',
  "  }",
  '  if (provider.startsWith("DELIVERY_DELAYED")) {',
  '    return { label: "Email delayed", className: "border-amber-400/25 bg-amber-500/10 text-amber-200", detail };',
  "  }",
  '  if (provider.startsWith("SENT") || row.dispatchStatus === "SENT") {',
  '    return { label: "Email sent", className: "border-sky-400/25 bg-sky-500/10 text-sky-200", detail };',
  "  }",
  '  if (row.dispatchStatus === "QUEUED" || row.dispatchStatus === "PROCESSING") {',
  '    return { label: "Email queued", className: "border-amber-400/25 bg-amber-500/10 text-amber-200", detail };',
  "  }",
  "",
  '  return { label: "Email status unknown", className: "border-white/10 bg-white/5 text-white/50", detail };',
  "}",
  "",
  deliveryFunctionMarker,
].join("\n");

if (!source.includes("function getTeamConfirmationDeliveryMeta(")) {
  if (!source.includes(deliveryFunctionMarker)) {
    throw new Error("Lead status helper marker was not found.");
  }
  source = source.replace(deliveryFunctionMarker, deliveryFunction);
}

const confirmationMapMarker = [
  "  const confirmationByLeadId = new Map(",
  "    confirmationRows.map((row) => [row.leadId, row]),",
  "  );",
].join("\n");

const deliveryQueryBlock = [
  confirmationMapMarker,
  "",
  "  const confirmationDeliveryRows = leads.length",
  "    ? await prisma.$queryRaw<Array<TeamConfirmationDeliveryRow>>(Prisma.sql`",
  '        SELECT DISTINCT ON (d."sourceId")',
  '          d."sourceId" AS "leadId",',
  '          d."status"::text AS "dispatchStatus",',
  '          d."sentAt",',
  '          d."failedAt",',
  '          d."failureReason",',
  '          d."createdAt",',
  '          m."providerStatus"',
  '        FROM "NotificationDispatch" AS d',
  "        LEFT JOIN LATERAL (",
  '          SELECT entry."providerStatus"',
  '          FROM "MessageEntry" AS entry',
  '          WHERE entry."notificationDispatchId" = d.id',
  '          ORDER BY entry."createdAt" DESC',
  "          LIMIT 1",
  "        ) AS m ON TRUE",
  "        WHERE d.\"sourceType\" IN ('LEAD_TEAM_CONFIRMATION', 'LEAD_TEAM_CONFIRMATION_CHASE')",
  '          AND d."sourceId" IN (${Prisma.join(leads.map((lead) => lead.id))})',
  '        ORDER BY d."sourceId", d."createdAt" DESC',
  "      `)",
  "    : [];",
  "",
  "  const confirmationDeliveryByLeadId = new Map(",
  "    confirmationDeliveryRows.map((row) => [row.leadId, row]),",
  "  );",
].join("\n");

if (!source.includes("const confirmationDeliveryRows =")) {
  if (!source.includes(confirmationMapMarker)) {
    throw new Error("Team confirmation map marker was not found.");
  }
  source = source.replace(confirmationMapMarker, deliveryQueryBlock);
}

const confirmationMetaLine =
  "                  const confirmationMeta = getConfirmationMeta(confirmation);";
const deliveryMetaLines = [
  confirmationMetaLine,
  "                  const confirmationDelivery = confirmationDeliveryByLeadId.get(lead.id) ?? null;",
  "                  const confirmationDeliveryMeta = getTeamConfirmationDeliveryMeta(confirmationDelivery);",
].join("\n");

if (!source.includes("const confirmationDeliveryMeta =")) {
  if (!source.includes(confirmationMetaLine)) {
    throw new Error("Team confirmation row metadata marker was not found.");
  }
  source = source.replace(confirmationMetaLine, deliveryMetaLines);
}

const quickSendBlock = `                              <LeadConfirmationQuickSendButton
                                leadId={lead.id}
                                canSend={canSendConfirmation}
                                alreadySent={Boolean(confirmation?.sentAt)}
                              />`;
const chaseOnlyBlock = `${quickSendBlock}
                              {confirmation?.status === "PENDING" && confirmation.sentAt ? (
                                <LeadConfirmationChaseButton
                                  leadId={lead.id}
                                  canChase={canSendConfirmation}
                                />
                              ) : null}`;
const chaseBlock = `${chaseOnlyBlock}
                              {confirmation?.sentAt && confirmationDeliveryMeta ? (
                                <div
                                  title={confirmationDeliveryMeta.detail}
                                  className={[
                                    "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
                                    confirmationDeliveryMeta.className,
                                  ].join(" ")}
                                >
                                  {confirmationDeliveryMeta.label}
                                </div>
                              ) : null}`;

if (!source.includes("<LeadConfirmationChaseButton")) {
  if (!source.includes(quickSendBlock)) {
    throw new Error("Lead confirmation quick-send button block was not found.");
  }
  source = source.replace(quickSendBlock, chaseBlock);
} else if (!source.includes("confirmationDeliveryMeta.label")) {
  if (!source.includes(chaseOnlyBlock)) {
    throw new Error("Existing team confirmation chase block was not found.");
  }
  source = source.replace(chaseOnlyBlock, chaseBlock);
}

source = source.replace(
  'label: `Sent ${formatDateTime(row.sentAt)}`',
  'label: `Link sent ${formatDateTime(row.sentAt)}`',
);

if (
  !source.includes(chaseImport) ||
  !source.includes("<LeadConfirmationChaseButton") ||
  !source.includes('confirmation?.status === "PENDING"') ||
  !source.includes("type TeamConfirmationDeliveryRow =") ||
  !source.includes("const confirmationDeliveryRows =") ||
  !source.includes("confirmationDeliveryMeta.label") ||
  !source.includes('label: "Email bounced"') ||
  !source.includes('label: "Email delivered"')
) {
  throw new Error("Team lead confirmation chase and delivery-status UI was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Pending team leads now show chase controls plus the latest confirmation-email delivery status on Admin Leads.",
);
