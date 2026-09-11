const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} anchor was not found.`);
  }
  return source.replace(before, after);
}

// Keep the final provider boundary aware of a saved team-lead decline. This is
// deliberately applied after the older compatibility scripts because those
// scripts also prepare the shared notification processor.
const processorPath = "src/lib/notifications/processor.ts";
let processor = read(processorPath);

const processorImport = 'import { applyTeamLeadChaseDeliveryGate } from "@/lib/leads/team-lead-chases";';
if (!processor.includes(processorImport)) {
  const importAnchor = 'import { playerLedgerNotificationBlock } from "@/lib/payments/player-ledger";';
  if (!processor.includes(importAnchor)) throw new Error("Notification processor import anchor was not found.");
  processor = processor.replace(importAnchor, `${processorImport}\n${importAnchor}`);
}

const emailProviderAnchor = "        const sendResult = await sendEmailWithResend({";
const smsProviderAnchor = "        const sendResult = await sendSmsWithTwilio({ to: dispatch.recipient.phone, body: dispatch.bodyText });";
const deliveryGate = [
  "        const leadChaseBlock = await applyTeamLeadChaseDeliveryGate(dispatch);",
  "        if (leadChaseBlock) {",
  "          result.skipped += 1;",
  "          result.items.push({ dispatchId: dispatch.id, status: \"skipped\", channel: dispatch.channel, message: leadChaseBlock });",
  "          continue;",
  "        }",
].join("\n");

const gateCount = (processor.match(/const leadChaseBlock = await applyTeamLeadChaseDeliveryGate\(dispatch\);/g) || []).length;
if (gateCount === 0) {
  if (!processor.includes(emailProviderAnchor) || !processor.includes(smsProviderAnchor)) {
    throw new Error("Notification provider anchors were not found.");
  }
  processor = processor.replace(emailProviderAnchor, `${deliveryGate}\n${emailProviderAnchor}`);
  processor = processor.replace(smsProviderAnchor, `${deliveryGate}\n${smsProviderAnchor}`);
} else if (gateCount !== 2) {
  throw new Error(`Expected exactly two team-lead delivery gates, found ${gateCount}.`);
}

if ((processor.match(/const leadChaseBlock = await applyTeamLeadChaseDeliveryGate\(dispatch\);/g) || []).length !== 2) {
  throw new Error("Both email and SMS team-lead delivery gates must be present.");
}
write(processorPath, processor);

// Reject new chases at queue time and clean up stale future chases before the
// queue is read. Existing sent/provider-accepted evidence is preserved by the
// lead-chase helper itself.
const servicePath = "src/lib/notifications/service.ts";
let service = read(servicePath);

const serviceImport = 'import { getTeamLeadChaseBlockReason, cancelStoppedTeamLeadChases } from "@/lib/leads/team-lead-chases";';
if (!service.includes(serviceImport)) {
  const importAnchor = 'import { getStaticEmailCtaUrl } from "@/lib/email/template-cta";';
  if (!service.includes(importAnchor)) throw new Error("Notification service import anchor was not found.");
  service = service.replace(importAnchor, `${serviceImport}\n${importAnchor}`);
}

service = replaceRequired(
  service,
  'type NotificationDb = Pick<typeof prisma,\n  "notificationDispatch" | "notificationTemplate" | "notificationRecipient">;',
  'type NotificationDb = Pick<typeof prisma,\n  "notificationDispatch" | "notificationTemplate" | "notificationRecipient" | "$queryRaw">;',
  "notification database query capability",
);

const templateReplacementAnchor = [
  "  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: template.channel, metadata: input.metadata });",
  "  if (replacementSmsBlock || fixtureBlockReason) {",
].join("\n");
const templateReplacement = [
  "  const leadChaseBlock = await getTeamLeadChaseBlockReason({ ...input, template }, db);",
  "  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: template.channel, metadata: input.metadata });",
  "  if (leadChaseBlock || replacementSmsBlock || fixtureBlockReason) {",
].join("\n");
service = replaceRequired(service, templateReplacementAnchor, templateReplacement, "template queue lead-chase gate");

const directReplacementAnchor = [
  "  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: input.channel, metadata: input.metadata });",
  "  if (replacementSmsBlock || fixtureBlockReason) {",
].join("\n");
const directReplacement = [
  "  const leadChaseBlock = await getTeamLeadChaseBlockReason(input, db);",
  "  const replacementSmsBlock = await getReplacementSmsCancellationReason({ channel: input.channel, metadata: input.metadata });",
  "  if (leadChaseBlock || replacementSmsBlock || fixtureBlockReason) {",
].join("\n");
service = replaceRequired(service, directReplacementAnchor, directReplacement, "direct queue lead-chase gate");

if (service.includes("      reason: replacementSmsBlock || fixtureBlockReason!,")) {
  service = service.replaceAll(
    "      reason: replacementSmsBlock || fixtureBlockReason!,",
    "      reason: leadChaseBlock || replacementSmsBlock || fixtureBlockReason!,",
  );
}

const dueAnchor = "export async function getDueNotificationDispatches(limit = 50) {\n";
const dueWithCleanup = [
  "export async function getDueNotificationDispatches(limit = 50) {",
  "  try {",
  "    const cancelledLeadChases = await cancelStoppedTeamLeadChases();",
  "    if (cancelledLeadChases) console.info(\"[team-lead-chases] Closed/declined lead follow-ups removed from queue\", { cancelled: cancelledLeadChases });",
  "  } catch (error) {",
  "    console.error(\"[team-lead-chases] Queue cleanup failed; final delivery checks remain active\", error);",
  "  }",
  "",
].join("\n");
if (!service.includes("const cancelledLeadChases = await cancelStoppedTeamLeadChases();")) {
  if (!service.includes(dueAnchor)) throw new Error("Notification due-queue anchor was not found.");
  service = service.replace(dueAnchor, dueWithCleanup);
}

const serviceGateCount = (service.match(/const leadChaseBlock = await getTeamLeadChaseBlockReason/g) || []).length;
if (serviceGateCount !== 2) throw new Error(`Expected two queue-time team-lead gates, found ${serviceGateCount}.`);
if (!service.includes('reason: leadChaseBlock || replacementSmsBlock || fixtureBlockReason!,')) {
  throw new Error("Team-lead queue cancellation reason is not wired in.");
}
if (!service.includes("cancelStoppedTeamLeadChases")) {
  throw new Error("Stopped team-lead queue cleanup is not wired in.");
}
write(servicePath, service);

// The fixture-reminder regression suite deliberately evaluates a very small
// dependency graph with all unrelated notification policy I/O mocked. Once the
// shared notification service gained the team-lead gate, teach that isolated
// harness about the two new no-op boundaries rather than making it load lead
// decision SQL that is tested separately by team-lead-decline.test.cjs.
const reminderTestPath = "tests/fixture-reminder-context.test.cjs";
if (fs.existsSync(path.join(root, reminderTestPath))) {
  let reminderTest = read(reminderTestPath);
  const leadMock = "    '@/lib/leads/team-lead-chases':{getTeamLeadChaseBlockReason:async()=>null,cancelStoppedTeamLeadChases:async()=>0},";
  if (!reminderTest.includes(leadMock)) {
    const mockAnchor = "    '@/lib/notifications/sms-short-links':{shortenSmsBodyLinks:({bodyText})=>({bodyText,links:[]})},";
    if (!reminderTest.includes(mockAnchor)) throw new Error("Fixture reminder mock anchor was not found.");
    reminderTest = reminderTest.replace(mockAnchor, `${leadMock}\n${mockAnchor}`);
    write(reminderTestPath, reminderTest);
  }
}

console.log("Applied team-lead decline queue and provider safeguards to final prepared source.");

// These run last so current kick-off, fee, AI-prediction and notification
// preparation stays authoritative while scheduling/admin wording becomes venue-neutral.
require("./apply-venue-neutral-fixtures-current.cjs");
require("./apply-venue-neutral-next-week-compat.cjs");
