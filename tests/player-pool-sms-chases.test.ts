import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ensurePlayerPoolTables } from "../src/lib/player-pool/storage";
import { getPlayerPoolProfileSmsHistory, queueDuePlayerPoolProfileSms, getPlayerPoolProfileSmsDeliveryBlock } from "../src/lib/player-pool/profile-sms-reminders";
import { emptyProfileSmsHistory, profileSmsPlan, FIRST_SMS_DELAY_MS, FINAL_SMS_DELAY_MS, PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE as FIRST, PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE as FINAL } from "../src/lib/player-pool/profile-sms-policy";
import PlayerPoolSmsChaseHistory from "../src/components/admin/player-pool/PlayerPoolSmsChaseHistory";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_ISOLATED_PLAYERPOOL_SMS_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_playerpool_sms_test", "Disposable local test database only.");
const migration = "prisma/migrations/20260906143000_player_pool_sms_chase_templates/migration.sql";
const now = new Date("2026-09-06T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600000);
const applyMigration = () => execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", migration], { stdio: "pipe" });
before(async () => { await ensurePlayerPoolTables(); applyMigration(); });
after(async () => { await prisma.$disconnect(); });

async function target(emailStatus: "SENT" | "FAILED" | "QUEUED" | null = "SENT") {
  const id = randomUUID();
  const prospect = await prisma.teamPlayerProspect.create({ data: { firstName: "Test", email: `${id}@example.invalid`, phone: "07700900123" } });
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"invitedAt","createdAt","updatedAt") VALUES (${id},${prospect.id},${id},${id},${id + "@example.invalid"},'INVITED',${ago(100)},${ago(100)},${ago(100)})`);
  const recipient = await prisma.notificationRecipient.create({ data: {
    sourceType: "GENERAL", sourceId: `player-pool-profile:${id}`, audience: "PLAYER", phone: "+447700900123",
    preferences: { create: { smsEnabled: true } },
  } });
  if (emailStatus) await prisma.notificationDispatch.create({ data: {
    recipientId: recipient.id, channel: "EMAIL", audience: "PLAYER", bodyText: "Test email", sourceType: "PLAYER_POOL_PROFILE_NUDGE", sourceId: id,
    status: emailStatus, sentAt: emailStatus === "SENT" ? ago(49) : null,
  } });
  return { id, recipient, prospect };
}
async function sentFirst(t: Awaited<ReturnType<typeof target>>, sentAt = ago(49)) {
  return prisma.notificationDispatch.create({ data: {
    recipientId: t.recipient.id, channel: "SMS", audience: "PLAYER", bodyText: "Legacy first chase", sourceType: FIRST,
    sourceId: t.id, status: "SENT", sentAt, createdAt: ago(96), variables: { profileUrl: `http://localhost:3000/player-pool/profile/${t.id}` },
  } });
const load = (id: string) => prisma.notificationDispatch.findUniqueOrThrow({ where: { id }, include: { recipient: true } });

 test("shared policy has two 48-hour delays and never treats queued time as sent", () => {
  assert.equal(FIRST_SMS_DELAY_MS, 48 * 3600000); assert.equal(FINAL_SMS_DELAY_MS, 48 * 3600000);
  const p = { status: "INVITED", profileSubmittedAt: null, phone: "07700900123" };
  assert.equal(profileSmsPlan(p, emptyProfileSmsHistory()).stage, null);
  assert.match(profileSmsPlan({ ...p, phone: null }, emptyProfileSmsHistory()).note, /mobile/);
});

test("an email must actually be sent; first chase never overtakes queued or failed email", async () => {
  for (const status of [null, "QUEUED", "FAILED"] as const) {
    const t = await target(status); assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
  }
  const t = await target();
  await prisma.notificationDispatch.updateMany({ where: { sourceId: t.id }, data: { sentAt: ago(47) } });
  assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
});

test("concurrent workers queue the first chase once, using the editable template", async () => {
  const t = await target();
  const results = await Promise.all(Array.from({ length: 4 }, () => queueDuePlayerPoolProfileSms(t.id, now)));
  assert.equal(results.filter(Boolean).length, 1);
  const saved = await prisma.notificationDispatch.findMany({ where: { sourceId: t.id, sourceType: FIRST }, include: { template: true } });
  assert.equal(saved.length, 1); assert.equal(saved[0].status, "QUEUED");
  assert.equal(saved[0].template?.key, "player-pool-profile-first-chase-sms");
  assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null, "a queued first message cannot cause a second");
});

test("legacy first-SMS sentAt anchors one final chase at exactly 48 hours; no third chase", async () => {
  const t = await target(); const first = await sentFirst(t, ago(48));
  assert.equal(await queueDuePlayerPoolProfileSms(t.id, new Date(now.getTime() - 1)), null);
  const results = await Promise.all([queueDuePlayerPoolProfileSms(t.id, now), queueDuePlayerPoolProfileSms(t.id, now)]);
  const final = results.find(Boolean)!; assert.equal(results.filter(Boolean).length, 1);
  assert.equal(final.stage, "final"); assert.equal(final.dispatch.sourceType, FINAL);
  assert.equal(await getPlayerPoolProfileSmsDeliveryBlock(await load(final.dispatch.id), now), null);
  await prisma.notificationDispatch.update({ where: { id: final.dispatch.id }, data: { status: "SENT", sentAt: now } });
  assert.equal(await queueDuePlayerPoolProfileSms(t.id, new Date(now.getTime() + 30 * 86400000)), null);
  const h = (await getPlayerPoolProfileSmsHistory([t.id])).get(t.id)!;
  assert.equal(h.first?.id, first.id); assert.equal(h.first?.sentAt?.toISOString(), ago(48).toISOString());
  assert.equal(h.final?.sentAt?.toISOString(), now.toISOString());
});

test("failed, skipped, processing and cancelled first chases cannot generate another automatic attempt", async () => {
  for (const status of ["FAILED", "SKIPPED", "PROCESSING", "CANCELLED"] as const) {
    const t = await target(); const first = await sentFirst(t);
    await prisma.notificationDispatch.update({ where: { id: first.id }, data: { status } });
    assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
  }
});

test("completion, pause, joined and no-longer-looking block both creation and already queued SMS delivery", async () => {
  for (const status of ["INVITED", "AVAILABLE", "PAUSED", "JOINED", "NOT_LOOKING"] as const) {
    const t = await target(); await sentFirst(t);
    const queued = (await queueDuePlayerPoolProfileSms(t.id, now))!;
    await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerPoolProfile" SET status=${status}, "profileSubmittedAt"=${status === "INVITED" ? now : null}::timestamp WHERE id=${t.id}`);
    assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
    assert.match((await getPlayerPoolProfileSmsDeliveryBlock(await load(queued.dispatch.id), now))!, /no longer awaiting/);
  }
});

test("missing phone, deletion, changed profile link and changed phone stop delivery", async () => {
  for (const change of ["no-phone", "delete", "link", "phone"]) {
    const t = await target(); const queued = (await queueDuePlayerPoolProfileSms(t.id, now))!;
    if (change === "delete") await prisma.$executeRaw(Prisma.sql`DELETE FROM "PlayerPoolProfile" WHERE id=${t.id}`);
    else if (change === "link") await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerPoolProfile" SET "profileToken"=${randomUUID()} WHERE id=${t.id}`);
    else await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { phone: change === "no-phone" ? null : "07700900456" } });
    assert.ok(await getPlayerPoolProfileSmsDeliveryBlock(await load(queued.dispatch.id), now));
    if (change === "no-phone") assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
  }
});

test("recipient opt-outs and disabled SMS preferences are not reset by the automatic chase", async () => {
  const t = await target(); await sentFirst(t);
  await prisma.notificationRecipient.update({ where: { id: t.recipient.id }, data: { transactionalSmsOptIn: false } });
  assert.equal(await queueDuePlayerPoolProfileSms(t.id, now), null);
  assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: t.recipient.id } })).transactionalSmsOptIn, false);
  const t2 = await target(); const queued = (await queueDuePlayerPoolProfileSms(t2.id, now))!;
  await prisma.notificationPreference.update({ where: { recipientId: t2.recipient.id }, data: { smsEnabled: false } });
  assert.match((await getPlayerPoolProfileSmsDeliveryBlock(await load(queued.dispatch.id), now))!, /disabled|opted out/);
});

test("duplicate legacy queued entries have one deterministic delivery winner", async () => {
  const t = await target(); const queued = (await queueDuePlayerPoolProfileSms(t.id, now))!;
  const duplicate = await prisma.notificationDispatch.create({ data: {
    recipientId: t.recipient.id, channel: "SMS", audience: "PLAYER", bodyText: queued.dispatch.bodyText,
    sourceType: FIRST, sourceId: t.id, status: "QUEUED", createdAt: new Date(queued.dispatch.createdAt.getTime() + 1000),
    variables: queued.dispatch.variables as Prisma.InputJsonValue,
  } });
  assert.equal(await getPlayerPoolProfileSmsDeliveryBlock(await load(queued.dispatch.id), now), null);
  assert.match((await getPlayerPoolProfileSmsDeliveryBlock(await load(duplicate.id), now))!, /duplicate/);
});

test("a concurrent profile completion wins before the worker reads and cannot leave a new chase", async () => {
  const t = await target(); await sentFirst(t);
  let release!: () => void; let locked!: () => void;
  const lockReady = new Promise<void>((resolve) => { locked = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const completion = prisma.$transaction(async (db) => {
    await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerPoolProfile" WHERE id=${t.id} FOR UPDATE`);
    locked(); await wait;
    await db.$executeRaw(Prisma.sql`UPDATE "PlayerPoolProfile" SET "profileSubmittedAt"=${now} WHERE id=${t.id}`);
  });
  await lockReady; const pending = queueDuePlayerPoolProfileSms(t.id, now); release();
  await completion; assert.equal(await pending, null);
});

test("templates remain editable and migration reruns preserve edits", async () => {
  const key = "player-pool-profile-final-chase-sms";
  const original = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key } });
  try {
    await prisma.notificationTemplate.update({ where: { key }, data: { body: "Edited test copy for {{firstName}}: {{profileUrl}}" } });
    applyMigration(); const t = await target(); await sentFirst(t);
    const queued = (await queueDuePlayerPoolProfileSms(t.id, now))!;
    assert.match(queued.dispatch.bodyText, /Edited test copy for Test/);
  } finally { await prisma.notificationTemplate.update({ where: { key }, data: { body: original.body } }); }
});

test("cards show actual sent time, queued schedule, failure and no-phone states without inventing sends", () => {
  const h = emptyProfileSmsHistory();
  h.first = { id: "first", status: "SENT", createdAt: ago(100), scheduledFor: ago(99), sentAt: new Date("2026-09-04T12:30:00Z"), failedAt: null, failureReason: null };
  h.final = { ...h.first, id: "final", status: "QUEUED", sentAt: null, scheduledFor: new Date("2026-09-06T14:00:00Z") };
  const p = { status: "INVITED", profileSubmittedAt: null, phone: "07700900123" };
  let html = renderToStaticMarkup(createElement(PlayerPoolSmsChaseHistory, { profile: p, history: h, now }));
  assert.match(html, /First SMS chase/); assert.match(html, /Second \/ final SMS chase/);
  assert.match(html, /Sent: 04 Sept 2026, 13:30/); assert.match(html, /Queued — scheduled for 06 Sept 2026, 15:00/);
  assert.doesNotMatch(html, /Sent: 06 Sept/);
  h.final = { ...h.final, status: "FAILED", failedAt: now, failureReason: "Test delivery failure" };
  html = renderToStaticMarkup(createElement(PlayerPoolSmsChaseHistory, { profile: p, history: h, now }));
  assert.match(html, /Failed:/); assert.match(html, /Test delivery failure/);
  html = renderToStaticMarkup(createElement(PlayerPoolSmsChaseHistory, { profile: { ...p, phone: null }, history: emptyProfileSmsHistory(), now }));
  assert.match(html, /No valid mobile number/);
});

test("production-prepared source wires the cards and guard, retaining the original cron entry point", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const page = read("src/app/(admin)/admin/player-pool/page.tsx");
  assert.match(page, /getPlayerPoolProfileSmsHistory\(visibleProfiles.map/);
  assert.match(page, /<PlayerPoolSmsChaseHistory/);
  assert.match(page, /PlayerPoolNudgeButton/); // existing email controls must survive prebuild
  const service = read("src/lib/player-pool/profile-sms-reminders.ts");
  assert.match(service, /queueNotificationFromTemplate/); assert.doesNotMatch(service, /queueDirectNotification|const body =/);
  const processor = read("src/lib/notifications/processor.ts");
  assert.ok(processor.indexOf("await getPlayerPoolProfileSmsDeliveryBlock(dispatch)") < processor.indexOf("await sendSmsWithTwilio"));
  assert.match(read("src/app/api/cron/notifications/route.ts"), /runPlayerPoolProfileSmsReminderJob/);
});
