import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { processRefereeEvening, refereeEveningDeliveryBlock, getEveningConfirmation, respondToEveningToken } from "../src/lib/referees/evening-notifications";
import { EVENING_SOURCE, HOUR } from "../src/lib/referees/evening-policy";
import { markNotificationDispatchProcessing, queueDirectNotification } from "../src/lib/notifications/service";

const dbUrl = process.env.DATABASE_URL ?? "";
const url = new URL(dbUrl || "http://invalid");
assert.ok(process.env.SIXFL_ISOLATED_REFEREE_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_referee_test", "This suite may run ONLY against the disposable local CI database.");
let legacyRecipientId: string;
before(async () => {
  const recipient = await prisma.notificationRecipient.create({ data: { sourceType: "REFEREE", sourceId: "legacy", audience: "REFEREE", email: "legacy@example.invalid" } });
  legacyRecipientId = recipient.id;
  for (const status of ["QUEUED", "FAILED", "SENT", "PROCESSING"] as const) await prisma.notificationDispatch.create({ data: {
    id: `legacy-${status}`, recipientId: recipient.id, channel: "EMAIL", audience: "REFEREE", status,
    bodyText: "Legacy fixture notice", sourceType: "FIXTURE_NIGHT_BOARD_REFEREE_NOTICE",
  } });
  await prisma.notificationDispatch.create({ data: { id: "personal-queued", recipientId: recipient.id, channel: "EMAIL", audience: "REFEREE", status: "QUEUED", bodyText: "Personal reply", sourceType: "DIRECT_REFEREE_MESSAGE" } });
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", "prisma/migrations/20260905223000_referee_evening_communications/migration.sql"], { stdio: "pipe" });
});
after(async () => { await prisma.$disconnect(); });

async function setup() {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { name: "Test Ref", email: `${id}@example.invalid`, role: "REFEREE" } });
  const league = await prisma.league.create({ data: { name: `Test League ${id}`, slug: id } });
  await prisma.$executeRaw(Prisma.sql`UPDATE "League" SET "minutesPerGame" = 40 WHERE id = ${league.id}`);
  const venue = await prisma.venue.create({ data: { name: "Test venue", address: "Test address" } });
  const home = await prisma.team.create({ data: { name: "Home NOT IN MESSAGES", claimCode: `${id}-home` } });
  const away = await prisma.team.create({ data: { name: "Away NOT IN MESSAGES", claimCode: `${id}-away` } });
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "RefereeProfile" ("userId", phone) VALUES (${user.id}, '+447700900000')`);
  const first = new Date(); first.setUTCDate(first.getUTCDate() + 4); first.setUTCHours(18, 0, 0, 0);
  const createFixture = async (offset = 0, refereeId: string | null = user.id, published = true) => prisma.fixture.create({ data: {
    leagueId: league.id, homeTeamId: home.id, awayTeamId: away.id, refereeId, venueId: venue.id,
    kickoffAt: new Date(first.getTime() + offset * 60_000), publishedAt: published ? new Date() : null,
  } });
  const f1 = await createFixture(); const f2 = await createFixture(40);
  const rows = await prisma.$queryRaw<Array<{ id: string; generation: number; nightDate: string }>>(Prisma.sql`SELECT id, generation, "nightDate"::text AS "nightDate" FROM "RefereeEveningNotice" WHERE "refereeId" = ${user.id}`);
  assert.equal(rows.length, 1);
  const eveningId = rows[0].id;
  const future = new Date(Date.now() + 61 * 60_000);
  const history = () => prisma.notificationDispatch.findMany({ where: { sourceType: EVENING_SOURCE, sourceId: eveningId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return { user, league, venue, f1, f2, first, future, eveningId, history, createFixture };
}

test("migration cancels legacy unsent automation, not sent/in-flight/personal mail", async () => {
  for (const state of ["QUEUED", "FAILED"]) assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({ where: { id: `legacy-${state}` } })).status, "CANCELLED");
  for (const state of ["SENT", "PROCESSING"]) assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({ where: { id: `legacy-${state}` } })).status, state);
  assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({ where: { id: "personal-queued" } })).status, "QUEUED");
});
test("concurrent cron runs create one booking; no teams in its text", async () => {
  const c = await setup();
  assert.equal((await processRefereeEvening(c.eveningId)).queued, 0);
  await Promise.all(Array.from({ length: 5 }, () => processRefereeEvening(c.eveningId, c.future)));
  const rows = await c.history(); assert.equal(rows.length, 1); assert.equal(rows[0].status, "QUEUED");
  assert.match(rows[0].bodyText, /Expected finish:/); assert.doesNotMatch(rows[0].bodyText, /NOT IN MESSAGES/);
  assert.equal(rows[0].channel, "EMAIL");
  const claims = await Promise.all(Array.from({ length: 5 }, () => markNotificationDispatchProcessing(rows[0].id)));
  assert.equal(claims.filter(Boolean).length, 0, "future scheduled dispatch cannot be claimed early");
  await prisma.notificationDispatch.update({ where: { id: rows[0].id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
  const dueClaims = await Promise.all(Array.from({ length: 5 }, () => markNotificationDispatchProcessing(rows[0].id)));
  assert.equal(dueClaims.filter(Boolean).length, 1);
});
test("assignment edits are atomic and stale queued messages cannot be delivered", async () => {
  const c = await setup(); await processRefereeEvening(c.eveningId, c.future);
  const original = (await c.history())[0];
  assert.equal(await refereeEveningDeliveryBlock(original, c.future), null);
  await c.createFixture(80);
  assert.ok(await refereeEveningDeliveryBlock(original, c.future));
  await processRefereeEvening(c.eveningId, c.future);
  const rows = await c.history(); assert.equal(rows.filter((r) => r.status === "QUEUED").length, 1);
  assert.equal(rows[0].status, "CANCELLED");
  const before = await prisma.$queryRaw<Array<{ generation: number }>>(Prisma.sql`SELECT generation FROM "RefereeEveningNotice" WHERE id = ${c.eveningId}`);
  await assert.rejects(prisma.$transaction(async (db) => {
    await db.fixture.update({ where: { id: c.f1.id }, data: { kickoffAt: new Date(c.first.getTime() + HOUR) } });
    throw new Error("Rollback test");
  }));
  const after = await prisma.$queryRaw<Array<{ generation: number }>>(Prisma.sql`SELECT generation FROM "RefereeEveningNotice" WHERE id = ${c.eveningId}`);
  assert.equal(after[0].generation, before[0].generation);
});
test("pitch and completed-score changes do not restart the booking timer", async () => {
  const c = await setup();
  const before = await prisma.$queryRaw<Array<{ generation: number }>>(Prisma.sql`SELECT generation FROM "RefereeEveningNotice" WHERE id = ${c.eveningId}`);
  await prisma.fixture.update({ where: { id: c.f1.id }, data: { pitch: "Pitch 3", status: "COMPLETED" } });
  const after = await prisma.$queryRaw<Array<{ generation: number }>>(Prisma.sql`SELECT generation FROM "RefereeEveningNotice" WHERE id = ${c.eveningId}`);
  assert.equal(after[0].generation, before[0].generation);
});
test("one live confirmation link, safe GET, no duplicate SMS after confirmation", async () => {
  const c = await setup(); await processRefereeEvening(c.eveningId, c.future);
  const email = (await c.history())[0]; const vars = email.variables as Record<string, string>;
  const token = vars.confirmationUrl.split("/").at(-1)!;
  assert.equal((await getEveningConfirmation(token))?.row.confirmationStatus, "PENDING");
  assert.equal((await getEveningConfirmation(token))?.row.consumedAt, null, "GET is read-only");
  await prisma.notificationDispatch.update({ where: { id: email.id }, data: { status: "SENT", sentAt: c.future } });
  assert.equal(await respondToEveningToken(token, "yes"), true);
  assert.equal(await respondToEveningToken(token, "no"), false, "consumed link cannot reverse the answer");
  const reminderTime = new Date(c.first.getTime() - 24 * HOUR);
  await processRefereeEvening(c.eveningId, reminderTime);
  await processRefereeEvening(c.eveningId, reminderTime);
  const sms = (await c.history()).filter((d) => d.channel === "SMS");
  assert.equal(sms.length, 1); assert.match(sms[0].bodyText, /reminder/); assert.doesNotMatch(sms[0].bodyText, /Please confirm/);
  await prisma.fixture.update({ where: { id: c.f2.id }, data: { kickoffAt: new Date(c.f2.kickoffAt.getTime() + HOUR) } });
  assert.equal(await getEveningConfirmation(token), null, "old timing token invalidated before next cron");
});
test("declining suppresses all automatic reminders", async () => {
  const c = await setup(); await processRefereeEvening(c.eveningId, c.future);
  const email = (await c.history())[0];
  const token = (email.variables as Record<string, string>).confirmationUrl.split("/").at(-1)!;
  await prisma.notificationDispatch.update({ where: { id: email.id }, data: { status: "SENT", sentAt: c.future } });
  assert.equal(await respondToEveningToken(token, "no"), true);
  await processRefereeEvening(c.eveningId, new Date(c.first.getTime() - 24 * HOUR));
  assert.equal((await c.history()).length, 1);
});
test("duration changes invalidate a queued finish time; administrator template edits survive", async () => {
  const c = await setup();
  const template = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: "referee-evening-booking-email" } });
  await prisma.notificationTemplate.update({ where: { id: template.id }, data: { subject: "Edited booking {{nightLabel}}" } });
  try {
    await processRefereeEvening(c.eveningId, c.future);
    const email = (await c.history())[0]; assert.match(email.subject!, /^Edited booking/);
    await prisma.$executeRaw(Prisma.sql`UPDATE "League" SET "minutesPerGame" = 30 WHERE id = ${c.league.id}`);
    assert.ok(await refereeEveningDeliveryBlock(email, c.future));
    assert.equal((await prisma.notificationTemplate.findUniqueOrThrow({ where: { id: template.id } })).subject, "Edited booking {{nightLabel}}");
  } finally { await prisma.notificationTemplate.update({ where: { id: template.id }, data: { subject: template.subject } }); }
});
test("London summer midnight date groups correctly; moving referee touches both owners", async () => {
  const c = await setup();
  await prisma.fixture.update({ where: { id: c.f1.id }, data: { kickoffAt: new Date("2027-06-30T23:30:00Z") } });
  const dates = await prisma.$queryRaw<Array<{ date: string }>>(Prisma.sql`SELECT "nightDate"::text AS date FROM "RefereeEveningNotice" WHERE "refereeId" = ${c.user.id}`);
  assert.ok(dates.some((d) => d.date === "2027-07-01"));
  const other = await prisma.user.create({ data: { role: "REFEREE", email: `${randomUUID()}@example.invalid` } });
  await prisma.fixture.update({ where: { id: c.f2.id }, data: { refereeId: other.id } });
  const owners = await prisma.$queryRaw<Array<{ refereeId: string }>>(Prisma.sql`SELECT "refereeId" FROM "RefereeEveningNotice" WHERE "refereeId" IN (${c.user.id}, ${other.id})`);
  assert.ok(owners.some((o) => o.refereeId === other.id)); assert.ok(owners.some((o) => o.refereeId === c.user.id));
});
test("legacy queue entry point is blocked even after migration", async () => {
  const result = await queueDirectNotification({ recipientId: legacyRecipientId, channel: "EMAIL", audience: "REFEREE", body: "Old assignment", subject: "Old", sourceType: "REFEREE_ASSIGNMENT_BACKFILL" });
  assert.equal(result.status, "CANCELLED");
});
