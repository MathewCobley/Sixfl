import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  EVENING_SOURCE, HOUR, eveningSnapshot, isLegacyRefereeNotice, planEveningNotice,
  type EveningFixture, type EveningHistory,
} from "../src/lib/referees/evening-policy";

const first = new Date("2027-01-05T18:00:00Z");
const assigned = new Date("2027-01-01T12:00:00Z");
const fixture = (id: string, offsetMinutes = 0, venueId = "venue-a", minutesPerGame: number | null = 40): EveningFixture => ({
  id, venueId, venueName: venueId, venueAddress: "Test address", minutesPerGame,
  kickoffAt: new Date(first.getTime() + offsetMinutes * 60_000),
});
const snapshot = eveningSnapshot([fixture("1"), fixture("2", 40), fixture("3", 80)]);
const sent: EveningHistory = { id: "email", kind: "booking", channel: "EMAIL", status: "SENT", hash: snapshot.hash,
  createdAt: new Date(assigned.getTime() + HOUR), sentAt: new Date(assigned.getTime() + HOUR), snapshot };
const plan = (overrides: Partial<Parameters<typeof planEveningNotice>[0]> = {}) => planEveningNotice({
  now: new Date(assigned.getTime() + HOUR), changedAt: assigned, snapshot, history: [], declined: false, ...overrides,
});

test("one email waits sixty minutes after the LAST change", () => {
  assert.equal(plan({ now: new Date(assigned.getTime() + HOUR - 1) }), null);
  assert.deepEqual(plan(), { kind: "booking", channel: "EMAIL", urgent: false });
  assert.equal(plan({ changedAt: new Date(assigned.getTime() + 20 * 60_000) }), null);
  assert.equal(plan({ changedAt: new Date(assigned.getTime() + 20 * 60_000), now: new Date(assigned.getTime() + 80 * 60_000) })?.kind, "booking");
});
test("hours ignore fixture IDs, ordering and internal assignments", () => {
  const other = eveningSnapshot([fixture("renamed-last", 80), fixture("new-middle", 20), fixture("renamed-first")]);
  assert.equal(other.hash, snapshot.hash);
  assert.equal(plan({ snapshot: other, history: [sent] }), null);
});
test("a venue change and actual duration change are material", () => {
  assert.notEqual(eveningSnapshot([fixture("1", 0, "venue-b"), fixture("3", 80, "venue-b")]).hash, snapshot.hash);
  assert.notEqual(eveningSnapshot([fixture("1"), fixture("3", 80, "venue-a", 30)]).hash, snapshot.hash);
});
test("expected finish uses saved match duration, never the last kickoff", () => {
  assert.equal(snapshot.last, "2027-01-05T19:20:00.000Z");
  assert.equal(snapshot.finish, "2027-01-05T20:00:00.000Z");
  assert.equal(eveningSnapshot([fixture("1", 0, "venue-a", null)]).finish, null);
  assert.equal(eveningSnapshot([fixture("1", 0, "venue-a", 180), fixture("2", 40, "venue-a", 20)]).finish, "2027-01-05T21:00:00.000Z");
});
test("multiple venues remain one evening with separate work windows", () => {
  const multi = eveningSnapshot([fixture("1"), fixture("2", 90, "venue-b")]);
  assert.equal(multi.segments.length, 2);
  assert.equal(plan({ snapshot: multi })?.channel, "EMAIL");
});
test("one routine SMS due 24h before first kickoff, including catch-up", () => {
  assert.equal(plan({ now: new Date(first.getTime() - 24 * HOUR - 1), history: [sent] }), null);
  assert.equal(plan({ now: new Date(first.getTime() - 24 * HOUR), history: [sent] })?.kind, "reminder");
  assert.equal(plan({ now: new Date(first.getTime() - 12 * HOUR), history: [sent] })?.channel, "SMS");
  const sms: EveningHistory = { ...sent, id: "sms", kind: "reminder", channel: "SMS", createdAt: new Date(first.getTime() - 24 * HOUR) };
  assert.equal(plan({ now: new Date(first.getTime() - 12 * HOUR), history: [sent, sms] }), null);
});
test("failed or skipped sends remain for admin repair, not endless auto-retry", () => {
  for (const status of ["QUEUED", "PROCESSING", "FAILED", "SKIPPED"]) {
    assert.equal(plan({ history: [{ ...sent, status }] }), null);
  }
  assert.equal(plan({ now: new Date(first.getTime() - 24 * HOUR), history: [{ ...sent, status: "FAILED", sentAt: null }] })?.kind, "reminder");
});
test("late booking bypasses settling but does not add another routine message", () => {
  const now = new Date(first.getTime() - 3 * HOUR);
  assert.deepEqual(plan({ now, changedAt: now }), { kind: "booking", channel: "EMAIL", urgent: true });
  const recent = { ...sent, createdAt: now, sentAt: now };
  assert.equal(plan({ now, changedAt: now, history: [recent] }), null);
  assert.equal(plan({ now: new Date(now.getTime() + HOUR), changedAt: now, history: [recent] })?.kind, "reminder");
});
test("declined and already-started evenings receive no routine reminders", () => {
  assert.equal(plan({ now: new Date(first.getTime() - 24 * HOUR), history: [sent], declined: true }), null);
  assert.equal(plan({ now: first, history: [sent] }), null);
  assert.equal(plan({ now: new Date(first.getTime() + 5 * HOUR), history: [sent] }), null);
});
test("only material changes produce an update; urgent update is one SMS", () => {
  const changed = eveningSnapshot([fixture("1"), fixture("2", 120)]);
  assert.deepEqual(plan({ snapshot: changed, history: [sent] }), { kind: "update", channel: "EMAIL", urgent: false });
  assert.deepEqual(plan({ now: new Date(first.getTime() - HOUR), snapshot: changed, history: [sent] }), { kind: "update", channel: "SMS", urgent: true });
});
test("cancellation before first send is silent; afterwards gives one notice", () => {
  const empty = eveningSnapshot([]);
  assert.equal(plan({ snapshot: empty }), null);
  assert.equal(plan({ snapshot: empty, history: [sent] })?.kind, "cancelled");
  const cancelled: EveningHistory = { ...sent, id: "cancelled", kind: "cancelled", snapshot: empty, hash: empty.hash, createdAt: new Date(sent.createdAt.getTime() + HOUR) };
  assert.equal(plan({ snapshot: empty, history: [sent, cancelled] }), null);
  assert.equal(plan({ history: [sent, cancelled] })?.kind, "update", "reinstatement must not be hidden by an older identical booking");
});
test("legacy block is narrowly scoped, never personal/finance/availability messages", () => {
  assert.ok(isLegacyRefereeNotice("FIXTURE_NIGHT_BOARD_REFEREE_NOTICE"));
  assert.ok(isLegacyRefereeNotice("REFEREE_NIGHT_CONFIRMATION_AUTO72H"));
  for (const source of [EVENING_SOURCE, "REFEREE_AVAILABILITY_REQUEST", "REFEREE_WELCOME", "REFEREE_PAYMENT", "DIRECT_REFEREE_MESSAGE", null]) assert.equal(isLegacyRefereeNotice(source), false);
});
test("production preparation preserves shared routing and migration safeguards", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const migration = read("prisma/migrations/20260905223000_referee_evening_communications/migration.sql");
  const core = read("src/lib/referees/evening-notifications.ts");
  const processor = read("src/lib/notifications/processor.ts");
  const service = read("src/lib/notifications/service.ts");
  const cron = read("src/app/api/cron/notifications/route.ts");
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON "Fixture"/);
  assert.match(migration, /AT TIME ZONE 'UTC' AT TIME ZONE 'Europe\/London'/);
  assert.match(migration, /ON CONFLICT \(key\) DO NOTHING/);
  assert.match(migration, /status IN \('QUEUED', 'FAILED'\)/);
  assert.match(core, /FOR UPDATE SKIP LOCKED/);
  assert.match(core, /queueNotificationFromTemplate/);
  assert.doesNotMatch(core, /queueDirectNotification/);
  assert.match(service, /status: DISPATCH_STATUS.QUEUED, scheduledFor/);
  assert.match(processor, /refereeEveningDeliveryBlock\(dispatch\)/);
  assert.match(processor, /acceptedByProvider/);
  assert.match(cron, /runRefereeEveningNotifications/);
  assert.doesNotMatch(cron, /queueDueRefereeNight(ReminderEmails|ConfirmationChasers)/);
  assert.ok(cron.indexOf('"process-existing-notification-queue"') < cron.indexOf('"referee-evening-bookings-and-reminders"'));
  const page = read("src/app/referee-evening-confirm/[token]/page.tsx");
  assert.match(page, /form action=\{respondToEveningAction\}/);
  assert.doesNotMatch(page, /await respondToEveningToken/);
});
