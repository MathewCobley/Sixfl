// One-time native source edits, removed by the branch-only workflow before PR review.
const fs = require('node:fs');
function edit(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error('Expected one anchor: ' + file + ': ' + before.slice(0, 100));
  fs.writeFileSync(file, source.replace(before, after));
}
function addImport(file, statement) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(statement)) fs.writeFileSync(file, source.includes('"use server";') ? source.replace('"use server";', '"use server";\n\n' + statement) : statement + '\n' + source);
}
const confirmation = 'src/lib/leads/teamPlaceConfirmation.ts';
addImport(confirmation, 'import { recordTeamLeadDecline, type TeamLeadDeclineAudit } from "./team-lead-decisions";');
addImport(confirmation, 'import { getTeamLeadChaseBlockReason } from "./team-lead-chases";');
let text = fs.readFileSync(confirmation, 'utf8');
const start = text.indexOf('export async function declineTeamPlaceFromLead(');
const end = text.indexOf('export async function getTeamPlaceConfirmationStatus(', start);
if (start < 0 || end < 0) throw new Error('Decline helper anchors missing');
text = text.slice(0, start) + 'export async function declineTeamPlaceFromLead(leadId: string, audit: TeamLeadDeclineAudit = {}) {\n  const cleanLeadId = leadId.trim();\n  return recordTeamLeadDecline(cleanLeadId, createTeamPlaceConfirmationToken(cleanLeadId), audit);\n}\n\n' + text.slice(end);
fs.writeFileSync(confirmation, text);
edit(confirmation, 'export async function ensureTeamPlaceConfirmationRecord(leadId: string) {\n  const cleanLeadId = leadId.trim();', 'export async function ensureTeamPlaceConfirmationRecord(leadId: string) {\n  const cleanLeadId = leadId.trim();\n  const stop = await getTeamLeadChaseBlockReason({ sourceType: "LEAD_TEAM_CONFIRMATION", sourceId: cleanLeadId });\n  if (stop) throw new Error(stop);');
edit(confirmation, 'WHEN "LeadTeamConfirmation"."status" = \'CONFIRMED\'::"LeadTeamConfirmationStatus" THEN "LeadTeamConfirmation"."status"', 'WHEN "LeadTeamConfirmation"."status" IN (\'CONFIRMED\'::"LeadTeamConfirmationStatus", \'DECLINED\'::"LeadTeamConfirmationStatus") THEN "LeadTeamConfirmation"."status"');
const page = 'src/app/(admin)/admin/leads/page.tsx';
addImport(page, 'import TeamLeadDecisionControls from "@/components/admin/leads/TeamLeadDecisionControls";');
edit(page, 'const canSendConfirmation = lead.interestType === "TEAM" && Boolean(lead.email?.trim()) && Boolean(lead.league);', 'const canSendConfirmation = lead.interestType === "TEAM" && lead.status !== "CLOSED" && confirmation?.status !== "DECLINED" && !lead.convertedTeamId && Boolean(lead.email?.trim()) && Boolean(lead.league);');
edit(page, '{formatLeadStatus(lead.status)}</Badge>', '{confirmation?.status === "DECLINED" ? "Not interested" : formatLeadStatus(lead.status)}</Badge>');
edit(page, '<LeadCallNotesCell leadId={lead.id} />', '<LeadCallNotesCell leadId={lead.id} />\n                        {lead.interestType === "TEAM" ? <div className="mt-3"><TeamLeadDecisionControls leadId={lead.id} leadName={leadTitle} declined={confirmation?.status === "DECLINED"} declinedAt={confirmation?.declinedAt?.toISOString() ?? null} converted={Boolean(lead.convertedTeamId)} /></div> : null}');
const layout = 'src/app/(admin)/admin/leads/[id]/layout.tsx';
addImport(layout, 'import TeamLeadDecisionPanel from "@/components/admin/leads/TeamLeadDecisionPanel";');
edit(layout, '      <LeadReplyEvidence evidence={evidence} />', '      <TeamLeadDecisionPanel leadId={id} />\n      <LeadReplyEvidence evidence={evidence} />');
const status = 'src/app/api/admin/leads/team-confirmation-sms-status/route.ts';
edit(status, 'if (row.confirmationStatus === "DECLINED") return "place released";', 'if (row.confirmationStatus === "DECLINED") return "not interested — chases stopped";');
edit(status, '    if (state === "received" && evidence.latestReply)', '    if (row.confirmationStatus === "DECLINED") status.lines.unshift({ text: "Not interested — registration chases stopped", tone: "muted" });\n    if (state === "received" && evidence.latestReply)');
const service = 'src/lib/notifications/service.ts';
addImport(service, 'import { getTeamLeadChaseBlockReason, cancelStoppedTeamLeadChases } from "@/lib/leads/team-lead-chases";');
edit(service, '"notificationDispatch" | "notificationTemplate" | "notificationRecipient">;', '"notificationDispatch" | "notificationTemplate" | "notificationRecipient" | "$queryRaw">;');
edit(service, '  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: template.channel, metadata: input.metadata });', '  const leadChaseBlock = await getTeamLeadChaseBlockReason({ ...input, template }, db);\n  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: template.channel, metadata: input.metadata });');
edit(service, '  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: input.channel, metadata: input.metadata });', '  const leadChaseBlock = await getTeamLeadChaseBlockReason(input);\n  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: input.channel, metadata: input.metadata });');
text = fs.readFileSync(service, 'utf8');
if (text.split('if (replacementSmsBlock || fixtureBlockReason)').length !== 3) throw new Error('Expected two queue gates');
text = text.replaceAll('if (replacementSmsBlock || fixtureBlockReason)', 'if (leadChaseBlock || replacementSmsBlock || fixtureBlockReason)').replaceAll('reason: replacementSmsBlock || fixtureBlockReason!', 'reason: leadChaseBlock || replacementSmsBlock || fixtureBlockReason!');
fs.writeFileSync(service, text);
edit(service, 'export async function getDueNotificationDispatches(limit = 50) {', 'export async function getDueNotificationDispatches(limit = 50) {\n  try { await cancelStoppedTeamLeadChases(); }\n  catch { console.error("[team-lead-chases] Queue cleanup failed; final delivery checks remain active."); }');
const processor = 'src/lib/notifications/processor.ts';
addImport(processor, 'import { applyTeamLeadChaseDeliveryGate } from "@/lib/leads/team-lead-chases";');
for (const anchor of ['        const sendResult = await sendEmailWithResend({', '        const sendResult = await sendSmsWithTwilio({']) {
  edit(processor, anchor, '        const leadChaseBlock = await applyTeamLeadChaseDeliveryGate(dispatch);\n        if (leadChaseBlock) {\n          result.skipped += 1;\n          result.items.push({ dispatchId: dispatch.id, status: "skipped", channel: dispatch.channel, message: leadChaseBlock });\n          continue;\n        }\n' + anchor);
}
// Avoid a late NEW->CONTACTED write undoing a concurrent decline.
for (const file of ['src/app/(admin)/admin/leads/team-commitment-email-actions.ts', 'src/app/(admin)/admin/leads/reassurance-email-actions.ts']) {
  text = fs.readFileSync(file, 'utf8');
  text = text.replace(/prisma\.interestLead\.update\(\{\s*where: \{ id: lead\.id \},\s*data: \{ status: LeadStatus\.CONTACTED, contactedAt: new Date\(\) \},\s*\}\)/g,
    'prisma.interestLead.updateMany({ where: { id: lead.id, status: LeadStatus.NEW }, data: { status: LeadStatus.CONTACTED, contactedAt: new Date() } })');
  fs.writeFileSync(file, text);
}
console.log('Native decline controls, shared decisions, queue and final provider guards prepared.');
