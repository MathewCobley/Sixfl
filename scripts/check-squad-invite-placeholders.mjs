import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

// The real route, context, renderer, queue and processor run against isolated
// in-memory boundaries. Never load a production DB or contact a delivery provider.
globalThis.fetch = async () => { throw new Error("External requests are forbidden in squad invite tests."); };
const require = createRequire(import.meta.url);
const root = process.cwd();
let checks = 0;
const templates = new Map();
const rows = [];
const recipient = { id: "test-recipient", email: "player@example.invalid", phone: null, isSuppressed: false,
  transactionalEmailOptIn: true, transactionalSmsOptIn: true, marketingEmailOptIn: true, marketingSmsOptIn: true,
  preferences: { emailEnabled: true, smsEnabled: true, marketingEmailEnabled: true, marketingSmsEnabled: true } };
const team = { id: "new-team", name: "Test Squad", logoUrl: null,
  league: { id: "test-league", name: "Test Monday League", season: "Autumn", area: "Test Area", dayOfWeek: "MONDAY", venueName: "Test Ground" } };
let prospect;
let startDate = null;
let authorised = true;
const resetProspect = (teamId = team.id) => { prospect = { id: "test-prospect", firstName: "Andy", lastName: "Example", email: recipient.email, phone: null, status: "NEW", teamId, team }; };
resetProspect();
const db = {
  $queryRaw: async () => [{ proposedStartDate: startDate }],
  notificationTemplate: {
    upsert: async ({ where, create, update }) => {
      const row = templates.has(where.key) ? { ...templates.get(where.key), ...update } : { id: `template-${templates.size}`, ...create };
      templates.set(where.key, row); return row;
    },
    findUnique: async ({ where }) => templates.get(where.key) || null,
  },
  notificationRecipient: { findUnique: async () => recipient },
  notificationDispatch: {
    create: async ({ data }) => { const row = { id: `dispatch-${rows.length}`, createdAt: new Date(), sentAt: null, ...data }; rows.push(row); return row; },
    findFirst: async ({ where }) => rows.find(row => row.sourceId === where.sourceId && row.sourceType === where.sourceType && (!where.status?.in || where.status.in.includes(row.status))) || null,
  },
  teamPlayerProspect: {
    findUnique: async () => prospect,
    update: async ({ data }) => { prospect = { ...prospect, ...data, team }; return prospect; },
  },
  team: { findUnique: async ({ select }) => {
    assert.equal(select.league.select.id, true, "team change must load the league ID for start-date context");
    assert.equal(select.league.select.area, true); return team;
  } },
  messageEntry: { findFirst: async () => null, create: async ({ data }) => ({ id: "entry", createdAt: new Date(), ...data }) },
  messageThread: { update: async () => ({ id: "test-thread" }) },
};
globalThis.__squadInviteTest = { db, recipient, rows, delivered: [] };
const baseMocks = {
  "@/lib/prisma": "export const prisma = globalThis.__squadInviteTest.db;",
  "@/lib/notifications/recipients": "export async function upsertNotificationRecipient() { return globalThis.__squadInviteTest.recipient; } export async function getNotificationRecipientById() { return globalThis.__squadInviteTest.recipient; }",
  "./recipients": "export async function getNotificationRecipientById() { return globalThis.__squadInviteTest.recipient; }",
  "@/lib/resend/client": "export function getEmailReplyDomain() { return 'replies.example.invalid'; }",
  "@/lib/fixtures/publishing": "export async function getUnpublishedFixtureBlockReason() { return null; }",
  "@/lib/communications/log-dispatch": "export async function logNotificationDispatchToThread() {}",
  "@/lib/squad/activationToken": "export function createSquadActivationToken(id) { return 'test-only-' + id; }",
  "@/lib/requireAdmin": "export async function requireAdmin() { return globalThis.__squadInviteTest.requireAdmin(); }",
  "next/cache": "export function revalidatePath() {}",
};
globalThis.__squadInviteTest.requireAdmin = () => { if (!authorised) throw new Error("Not authorised"); return { user: { id: "test-admin" } }; };
async function load(entry, extraMocks = {}) {
  const mocks = { ...baseMocks, ...extraMocks };
  const outfile = path.join(root, `.squad-invite-test-${randomUUID()}.cjs`);
  try {
    await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated-boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "test-mock" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "test-mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
    return require(outfile);
  } finally { try { unlinkSync(outfile); } catch {} }
}
async function check(name, fn) { await fn(); checks++; console.log(`PASS: ${name}`); }
const invites = await load("src/lib/managed-squad/prospectJoinConfirmation.ts");
const service = await load("src/lib/notifications/service.ts");
const renderer = await load("src/lib/notifications/renderer.ts");
const route = await load("src/app/api/admin/player-prospects/change-team/route.ts");
const key = invites.MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY;
await invites.ensureManagedSquadJoinConfirmationTemplate();
await invites.ensureManagedSquadJoinChaseTemplates();
const original = { ...templates.get(key) };
const request = sendInvite => new Request("http://localhost/api/admin/player-prospects/change-team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prospectId: prospect.id, teamId: team.id, sendInvite }) });

await check("old team-change variables reproduce the defect and cannot create a sendable email", async () => {
  const before = rows.length;
  await assert.rejects(() => service.queueNotificationFromTemplate({ templateKey: key, recipientId: recipient.id,
    variables: { firstName: "Andy", teamName: team.name, teamContextLine: "Test schedule", joinConfirmationUrl: "http://localhost/test" } }), /squadAccessLine.*squadInviteIntroLine/);
  assert.equal(rows.length, before);
});
await check("one read-only context supplies every invite field for future, current and unknown starts", async () => {
  const before = rows.length;
  for (const days of [null, -2, 0, 10]) {
    startDate = days === null ? null : new Date(Date.now() + days * 86400000);
    const context = await invites.buildProspectEmailContext(prospect);
    for (const field of ["squadInviteIntroLine", "squadAccessLine", "teamContextLine", "joinConfirmationUrl"]) assert.ok(context.variables[field]);
    const rendered = renderer.renderNotificationText(original.body, context.variables);
    assert.deepEqual(renderer.extractNotificationTokens(rendered), ["cta"]);
    if (days === 10) assert.match(context.variables.teamContextLine, /is due to start/);
    if (days === 0) assert.match(context.variables.teamContextLine, /starts today/);
  }
  startDate = null; assert.equal(rows.length, before);
});
await check("ordinary invitation and both chasers use the shared complete context", async () => {
  await invites.queueManagedSquadJoinConfirmationEmail({ prospectId: prospect.id });
  await invites.queueManagedSquadJoinChaseEmail({ prospectId: prospect.id, chaseType: "CHASE" });
  await invites.queueManagedSquadJoinChaseEmail({ prospectId: prospect.id, chaseType: "FINAL" });
  for (const row of rows) { assert.equal(renderer.getUnresolvedEmailPlaceholderReason(row), null); assert.match(row.bodyHtml, /test-only-test-prospect/); }
});
await check("actual change-team POST uses the shared context and new team's start details", async () => {
  resetProspect("old-team"); startDate = new Date(Date.now() + 10 * 86400000);
  const before = rows.length;
  const response = await route.POST(request(true)); const result = await response.json();
  assert.equal(result.inviteQueued, true); assert.equal(result.warning, null); assert.equal(rows.length, before + 1);
  const row = rows.at(-1); assert.equal(row.metadata.teamId, team.id); assert.equal(row.metadata.origin, "squad_invite_team_change");
  assert.match(row.bodyText, /new SIXFL Test Area league/); assert.match(row.bodyText, /is due to start/);
  assert.equal(renderer.getUnresolvedEmailPlaceholderReason(row), null); startDate = null;
});
await check("sendInvite false and unauthorised requests do not queue anything", async () => {
  resetProspect("old-team"); const before = rows.length;
  assert.equal((await (await route.POST(request(false))).json()).inviteQueued, false);
  resetProspect("old-team"); authorised = false;
  assert.equal((await route.POST(request(true))).status, 500); authorised = true;
  assert.equal(rows.length, before);
});
await check("template edits and disabled flags survive all ensure calls", async () => {
  const snapshots = [...templates.values()].map(row => ({ ...row, body: "Custom {{firstName}} copy", subject: "Custom subject", isActive: false }));
  snapshots.forEach(row => templates.set(row.key, row));
  await invites.ensureManagedSquadJoinConfirmationTemplate(); await invites.ensureManagedSquadJoinChaseTemplates();
  snapshots.forEach(row => assert.deepEqual(templates.get(row.key), row));
  await assert.rejects(() => service.queueNotificationFromTemplate({ templateKey: key, recipientId: recipient.id }), /inactive/);
  templates.set(key, original);
});
await check("a custom unresolved field reports a warning without undoing a requested team move", async () => {
  templates.set(key, { ...original, body: original.body + "\n{{missingCustomField}}" }); resetProspect("old-team");
  const before = rows.length; const result = await (await route.POST(request(true))).json();
  assert.equal(result.ok, true); assert.equal(result.inviteQueued, false); assert.match(result.warning, /missingCustomField/);
  assert.equal(prospect.teamId, team.id); assert.equal(rows.length, before); templates.set(key, original);
});
await check("the shared final-content guard checks subject, text and HTML but leaves SMS unchanged", async () => {
  for (const field of ["subject", "bodyText", "bodyHtml"]) {
    assert.match(renderer.getUnresolvedEmailPlaceholderReason({ channel: "EMAIL", [field]: "{{ unknown.value }}" }), /unknown.value/);
  }
  assert.equal(renderer.getUnresolvedEmailPlaceholderReason({ channel: "SMS", bodyText: "{{unknown}}" }), null);
});
await check("both queued template emails and direct email replies reject unresolved output", async () => {
  const before = rows.length;
  await assert.rejects(() => service.queueDirectNotification({ recipientId: recipient.id, channel: "EMAIL", audience: "PLAYER", subject: "Hello", body: "{{missing}}" }), /missing/);
  assert.equal(rows.length, before);
  templates.set("optional-test", { ...original, key: "optional-test", body: "Hi {{firstName}}\n{{pollOptions}}\n{{pollLink}}\n{{cta}}" });
  const row = await service.queueNotificationFromTemplate({ templateKey: "optional-test", recipientId: recipient.id, variables: { firstName: "Andy", teamName: team.name, joinConfirmationUrl: "http://localhost/test" } });
  assert.equal(renderer.getUnresolvedEmailPlaceholderReason(row), null);
});
await check("processor blocks old malformed queued emails without repairing or resending history", async () => {
  const delivered = globalThis.__squadInviteTest.delivered;
  const queue = [
    { id: "old-broken", channel: "EMAIL", sourceType: "MANAGED_SQUAD_JOIN_CONFIRMATION", sourceId: "old-prospect", status: "QUEUED", subject: "Old invite", bodyText: "{{squadInviteIntroLine}}", bodyHtml: "<p>{{squadAccessLine}}</p>" },
    { id: "valid-new", channel: "EMAIL", sourceType: "MANAGED_SQUAD_JOIN_CONFIRMATION", sourceId: "new-prospect", status: "QUEUED", subject: "Valid invite", bodyText: "Hi Andy", bodyHtml: "<p>Hi Andy</p>" },
    { id: "historical-sent", channel: "EMAIL", status: "SENT", subject: "Old sent email", bodyText: "{{squadAccessLine}}" },
  ].map(row => ({ recipient, recipientId: recipient.id, createdAt: new Date(), metadata: {}, ...row }));
  const historical = JSON.stringify(queue[2]); const oldBody = queue[0].bodyHtml;
  globalThis.__squadInviteTest.queue = queue;
  const processor = await load("src/lib/notifications/processor.ts", {
    "./service": `const s=globalThis.__squadInviteTest;
      export async function getDueNotificationDispatches(){return s.queue.filter(x=>x.status==='QUEUED');}
      export async function markNotificationDispatchProcessing(id){s.queue.find(x=>x.id===id).status='PROCESSING';return true;}
      export async function markNotificationDispatchCancelled(id,reason){Object.assign(s.queue.find(x=>x.id===id),{status:'CANCELLED',failureReason:reason});}
      export async function markNotificationDispatchSent({dispatchId}){s.queue.find(x=>x.id===dispatchId).status='SENT';}
      export async function markNotificationDispatchFailed({dispatchId,errorMessage}){Object.assign(s.queue.find(x=>x.id===dispatchId),{status:'FAILED',failureReason:errorMessage});}`,
    "./providers/resend": "export async function sendEmailWithResend(input){globalThis.__squadInviteTest.delivered.push(input);return {provider:'test-only',providerMessageId:'test-id',fromEmail:'test@example.invalid'};}",
    "./providers/twilio": "export async function sendSmsWithTwilio(){throw new Error('No SMS should be attempted.');}",
    "@/lib/messaging/service": "export async function findOrCreateEmailThreadForOutbound(){return {id:'test-thread',replyAddress:'test@example.invalid'};} export async function linkDispatchToThread(){}",
    "@/lib/referees/evening-notifications": "export async function refereeEveningDeliveryBlock(){return null;}",
    "@/lib/player-pool/profile-sms-reminders": "export async function getPlayerPoolProfileSmsDeliveryBlock(){return null;}",
  });
  const result = await processor.processNotificationQueue();
  assert.equal(result.sent, 1); assert.equal(delivered.length, 1); assert.equal(delivered[0].subject, "Valid invite");
  assert.equal(queue[0].status, "CANCELLED"); assert.match(queue[0].failureReason, /unresolved/);
  assert.equal(queue[0].bodyHtml, oldBody); assert.equal(JSON.stringify(queue[2]), historical);
  const second = await processor.processNotificationQueue(); assert.equal(second.sent, 0); assert.equal(delivered.length, 1);
});
await check("prepared-source contract protects all native callsites", () => {
  const read = p => readFileSync(p, "utf8");
  const change = read("src/app/api/admin/player-prospects/change-team/route.ts");
  assert.ok(change.includes("buildProspectEmailContext({") && change.includes("variables: context.variables"));
  assert.ok(!change.includes("function getTeamContextLine("));
  const queue = read("src/lib/notifications/service.ts");
  assert.equal((queue.match(/getUnresolvedEmailPlaceholderReason\(\{/g) || []).length, 2);
  const processor = read("src/lib/notifications/processor.ts");
  assert.ok(processor.indexOf("getUnresolvedEmailPlaceholderReason(dispatch)") < processor.indexOf("await sendEmailWithResend("));
  assert.equal((read("src/lib/managed-squad/prospectJoinConfirmation.ts").match(/await buildProspectEmailContext\(/g) || []).length, 2);
});
console.log(`Squad invite placeholder regression passed: ${checks} checks. No real emails, SMS or database writes.`);
