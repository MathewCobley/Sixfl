import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../src/lib/prisma";
import { ensurePlayerPoolTables } from "../src/lib/player-pool/storage";
import { getPlayerPoolContactHistory } from "../src/lib/player-pool/contact-history";
import { queuePlayerPoolResponseCheck, getPlayerPoolResponseDeliveryBlock, parseResponseCheckRun, runConfiguredPlayerPoolResponseCheck } from "../src/lib/player-pool/response-check";
import type { PlayerPoolProfileReminderTarget } from "../src/lib/player-pool/profile-reminders";
import PlayerPoolContactHistory from "../src/components/admin/player-pool/PlayerPoolContactHistory";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_ISOLATED_RESPONSE_CHECK_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_response_check_test", "Isolated test database only");
global.fetch = async () => { throw new Error("No external provider access in tests"); };
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
let phoneSequence = 100;
const migration = "prisma/migrations/20260912183000_player_pool_response_check/migration.sql";
const migrate = () => execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", migration], { stdio: "pipe" });
before(async () => { await ensurePlayerPoolTables(); migrate(); });
after(async () => { await prisma.$disconnect(); });
async function target() {
  const id = randomUUID(); const email = `${id}@example.invalid`; const phone = `07700900${++phoneSequence}`;
  const prospect = await prisma.teamPlayerProspect.create({ data: { firstName: "Test", email, phone } });
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"invitedAt","createdAt","updatedAt")
    VALUES (${id},${prospect.id},${id},${'PP-' + id.replaceAll('-', '').toUpperCase()},${email},'INVITED',${ago(100)},${ago(100)},${ago(100)})`);
  const recipient = await prisma.notificationRecipient.create({ data: { sourceType: "GENERAL", sourceId: `player-pool-profile:${id}`,
    audience: "PLAYER", email, emailNormalized: email, phone: `+44${phone.slice(1)}`, phoneNormalized: `+44${phone.slice(1)}`, preferences: { create: {} } } });
  const profile: PlayerPoolProfileReminderTarget = { id, prospectId: prospect.id, profileToken: id, publicCode: 'PP-' + id.replaceAll('-', '').toUpperCase(), status: "INVITED",
    profileSubmittedAt: null, area: null, leagueId: null, firstName: "Test", lastName: null, email, phone, leagueName: null };
  return { id, prospect, recipient, profile };
}
const queue = (t: Awaited<ReturnType<typeof target>>, bulkRunId?: string) => queuePlayerPoolResponseCheck({ profile: t.profile,
  origin: "player_pool_profile_bulk_reminder", originLabel: "Isolated test", bulkRunId });
const dispatch = (id: string) => prisma.notificationDispatch.findUniqueOrThrow({ where: { id }, include: { recipient: true } });
async function reply(t: Awaited<ReturnType<typeof target>>, body = "NO") {
  const thread = await prisma.messageThread.create({ data: { channel: "EMAIL", emailNormalized: t.profile.email, contactEmail: t.profile.email } });
  return prisma.messageEntry.create({ data: { threadId: thread.id, channel: "EMAIL", direction: "INBOUND", participantRole: "CONTACT", body, receivedAt: new Date() } });
}

test("history distinguishes an invitation from a reminder, deduplicates a logged dispatch, and finds a reply through the contact", async () => {
  const t = await target();
  const d = await prisma.notificationDispatch.create({ data: { recipientId: t.recipient.id, channel: "EMAIL", audience: "PLAYER", status: "SENT",
    sourceType: "PLAYER_POOL_PROFILE_INVITE", sourceId: t.id, bodyText: "test", subject: "Original invite", sentAt: ago(80), createdAt: ago(80) } });
  const thread = await prisma.messageThread.create({ data: { recipientId: t.recipient.id, sourceId: t.id } });
  await prisma.messageEntry.create({ data: { threadId: thread.id, channel: "EMAIL", direction: "OUTBOUND", participantRole: "SYSTEM", notificationDispatchId: d.id, body: "test", sentAt: ago(80) } });
  await reply(t);
  const h = (await getPlayerPoolContactHistory([t.id])).get(t.id)!;
  assert.equal(h.events.filter(e => e.kind === "Profile invitation").length, 1);
  assert.equal(h.events.filter(e => e.direction === "OUTBOUND").length, 1);
  assert.ok(h.latestReplyAt); assert.equal((await queue(t)).ok, false);
  assert.equal((await prisma.$queryRaw<Array<{status:string}>>`SELECT status FROM "PlayerPoolProfile" WHERE id=${t.id}`)[0].status, "INVITED", "Free-text NO is held for review, not an inferred automatic decision");
});

test("concurrent bulk clicks enqueue exactly one email, with editable yes/no copy and an actual dispatch record", async () => {
  const t = await target(); const result = await Promise.all(Array.from({ length: 4 }, () => queue(t, "test-campaign-one")));
  assert.equal(result.filter(r => r.ok).length, 1);
  const rows = await prisma.notificationDispatch.findMany({ where: { sourceId: t.id }, include: { template: true } });
  assert.equal(rows.length, 1); assert.equal(rows[0].status, "QUEUED"); assert.equal(rows[0].sentAt, null);
  assert.equal(rows[0].template?.key, "player-pool-response-check-email");
  assert.match(rows[0].bodyText, /reply.*NO/i); assert.match(rows[0].bodyText, /cannot introduce you/);
  assert.ok(rows[0].bodyText.includes(`/player-pool/profile/${t.id}`));
  assert.ok(rows[0].bodyHtml?.includes(`/player-pool/profile/${t.id}`), "The HTML button retains the same secure target");
  assert.doesNotMatch(rows[0].bodyText + rows[0].bodyHtml, /\{\{[^}]+\}\}/, "No unresolved placeholders");
  const h = (await getPlayerPoolContactHistory([t.id])).get(t.id)!;
  assert.equal(h.events[0].status, "QUEUED"); assert.equal(h.latestContactAt, null);
});

test("recent invitation and a pending contact message block another email", async () => {
  for (const status of ["SENT", "QUEUED"] as const) {
    const t = await target();
    await prisma.notificationDispatch.create({ data: { recipientId: t.recipient.id, channel: "EMAIL", audience: "PLAYER", bodyText: "test", status,
      sourceType: "PLAYER_POOL_PROFILE_INVITE", sourceId: t.id, sentAt: status === "SENT" ? ago(1) : null } });
    assert.equal((await queue(t)).ok, false);
  }
});

test("all profiles with a disabled preference, an opt-out, an existing squad or a finished status are skipped", async () => {
  for (const cause of ["optout", "preference", "squad", "completed", "paused"]) {
    const t = await target();
    if (cause === "optout") await prisma.notificationRecipient.update({ where: { id: t.recipient.id }, data: { transactionalEmailOptIn: false } });
    if (cause === "preference") await prisma.notificationPreference.update({ where: { recipientId: t.recipient.id }, data: { emailEnabled: false } });
    if (cause === "completed") await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET "profileSubmittedAt"=NOW() WHERE id=${t.id}`;
    if (cause === "paused") await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET status='PAUSED' WHERE id=${t.id}`;
    if (cause === "squad") {
      const u = await prisma.user.create({ data: { email: t.profile.email } });
      const team = await prisma.team.create({ data: { name: t.id, claimCode: t.id } });
      await prisma.teamMember.create({ data: { userId: u.id, teamId: team.id, role: "PLAYER" } });
    }
    assert.equal((await queue(t)).ok, false, cause);
    assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.id } }), 0);
    if (cause === "optout") assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: t.recipient.id } })).transactionalEmailOptIn, false);
  }
});

test("a reply, completion, changed email or suppression after queueing prevents provider submission", async () => {
  for (const cause of ["reply", "completed", "email", "suppressed"]) {
    const t = await target(); assert.equal((await queue(t)).ok, true);
    const d = await prisma.notificationDispatch.findFirstOrThrow({ where: { sourceId: t.id } });
    if (cause === "reply") await reply(t, "Please help me with the form");
    if (cause === "completed") await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET "profileSubmittedAt"=NOW() WHERE id=${t.id}`;
    if (cause === "email") await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { email: "changed@example.invalid" } });
    if (cause === "suppressed") await prisma.notificationRecipient.update({ where: { id: t.recipient.id }, data: { isSuppressed: true } });
    assert.ok(await getPlayerPoolResponseDeliveryBlock(await dispatch(d.id)), cause);
  }
  const t = await target(); await queue(t); const d = await prisma.notificationDispatch.findFirstOrThrow({ where: { sourceId: t.id } });
  assert.equal(await getPlayerPoolResponseDeliveryBlock(await dispatch(d.id)), null, "An eligible queued message can proceed");
});

test("same operational run never retries a failed or cancelled attempt", async () => {
  const t = await target(); await queue(t, "test-once-only");
  await prisma.notificationDispatch.updateMany({ where: { sourceId: t.id }, data: { status: "FAILED", failedAt: new Date() } });
  assert.equal((await queue(t, "test-once-only")).ok, false);
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.id } }), 1);
});

test("migration reruns preserve administrator template edits and disabled flags", async () => {
  const key = "player-pool-response-check-email"; const original = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key } });
  await prisma.notificationTemplate.update({ where: { key }, data: { body: "Administrator edit", isActive: false } }); migrate();
  const read = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key } });
  assert.equal(read.body, "Administrator edit"); assert.equal(read.isActive, false);
  await prisma.notificationTemplate.update({ where: { key }, data: { body: original.body, isActive: true } });
});

test("operational send requires an audited snapshot, expires, defaults off, and audit is read-only", async () => {
  assert.equal(parseResponseCheckRun(undefined), null);
  assert.throws(() => parseResponseCheckRun(JSON.stringify({ id: "test-run1", mode: "send", asOf: ago(1).toISOString() })));
  assert.equal(parseResponseCheckRun(JSON.stringify({ id: "test-run1", mode: "audit", asOf: ago(25).toISOString() })), null);
  const beforeCount = await prisma.notificationDispatch.count();
  process.env.PLAYER_POOL_RESPONSE_CHECK = JSON.stringify({ id: "test-audit1", mode: "audit", asOf: new Date().toISOString() });
  process.env.CRON_SECRET = "test-only";
  await runConfiguredPlayerPoolResponseCheck();
  assert.equal(await prisma.notificationDispatch.count(), beforeCount);
  delete process.env.PLAYER_POOL_RESPONSE_CHECK;
});

test("native cards show real history without claiming queued messages were delivered or silence was a decline", async () => {
  const t = await target(); await queue(t);
  const h = (await getPlayerPoolContactHistory([t.id])).get(t.id)!;
  const html = renderToStaticMarkup(createElement(PlayerPoolContactHistory, { history: h, prospectId: t.prospect.id }));
  assert.match(html, /Contact &amp; reply history/); assert.match(html, /queued/); assert.match(html, /Silence is not a decline/);
  assert.doesNotMatch(html, /MutationObserver|<script/);
  assert.equal(existsSync("scripts/apply-player-pool-nudge-history.cjs"), false);
  assert.equal(existsSync("scripts/apply-player-pool-comms-link.cjs"), false);
  assert.doesNotMatch(readFileSync("package.json", "utf8"), /apply-player-pool-comms-link/);
  assert.match(readFileSync("src/app/(admin)/admin/player-pool/page.tsx", "utf8"), /<PlayerPoolContactHistory/);
});
