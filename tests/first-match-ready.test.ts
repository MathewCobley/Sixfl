import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { queueFirstMatchReadyEmail as queue, getFirstMatchReadyDeliveryBlock as block, getFirstMatchReadyStatus as status, FIRST_MATCH_READY_TEMPLATE as KEY } from "../src/lib/captain/first-match-ready";
import { runCaptainOnboardingEmailJob, queueCaptainOnboardingEmailForTeam } from "../src/lib/captain/onboarding-emails";
import FirstMatchReadyStatus from "../src/components/admin/teams/FirstMatchReadyStatus";
import { renderToStaticMarkup } from "react-dom/server";

const database = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_FIRST_MATCH_TEST === "1" && database.hostname === "127.0.0.1" && database.pathname === "/sixfl_first_match_test", "Disposable local database only");
globalThis.fetch = async () => { throw new Error("Provider/network calls are forbidden in first-match tests"); };
const migration = "prisma/migrations/20260908103000_first_match_ready_briefing/migration.sql";
const migrate = (file: string) => execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: "pipe" });
const now = new Date("2099-09-08T10:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3600_000);
let originalBody = "";
before(async () => {
  migrate("prisma/migrations/20260624224500_add_captain_onboarding/migration.sql");
  migrate("prisma/migrations/20260725193000_fixture_placeholder_teams/migration.sql");
  migrate(migration);
  originalBody = (await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: KEY } })).body;
});
after(async () => { await prisma.$disconnect(); });
async function target(hours = 8) {
  const id = randomUUID();
  const league = await prisma.league.create({ data: { name: `Test league ${id}`, slug: id, season: "Test", venueName: "League fallback venue" } });
  const team = await prisma.team.create({ data: { name: `First timers ${id}`, claimCode: id, leagueId: league.id, contactName: "Alex", contactEmail: `${id}@example.invalid` } });
  const opponent = await prisma.team.create({ data: { name: `Opponent ${id}`, claimCode: `${id}-opponent`, leagueId: league.id } });
  const venue = await prisma.venue.create({ data: { name: "Test Sports Centre", address: "1 Test Road", postcode: "TEST 1AA" } });
  const fixture = await prisma.fixture.create({ data: { leagueId: league.id, homeTeamId: team.id, awayTeamId: opponent.id, venueId: venue.id,
    pitch: "Pitch 2", status: "SCHEDULED", kickoffAt: at(hours), publishedAt: at(-1) } });
  await prisma.$executeRaw(Prisma.sql`UPDATE "Team" SET "onboardingWelcomeEmailSentAt" = NOW(), "onboardingPostFirstMatchEmailSentAt" = NOW() WHERE id = ${team.id}`);
  return { team, opponent, league, venue, fixture };
}
type Target = Awaited<ReturnType<typeof target>>;
const dispatches = (t: Target) => prisma.notificationDispatch.findMany({ where: { sourceType: "TEAM", sourceId: t.team.id }, include: { recipient: true, template: true } });
async function queued(t: Target) {
  assert.equal(await queue({ teamId: t.team.id, now }), "queued");
  const rows = await dispatches(t); assert.equal(rows.length, 1); return rows[0];
}
async function extra(t: Target, hours: number, statusValue: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "POSTPONED" = "SCHEDULED", published = true) {
  return prisma.fixture.create({ data: { leagueId: t.league.id, homeTeamId: t.team.id, awayTeamId: t.opponent.id,
    kickoffAt: at(hours), status: statusValue, publishedAt: published ? at(-200) : null } });
}

test("tonight's first game is eligible immediately; the briefing includes fixture facts, arrival, shin pads and nine-player rule", async () => {
  const t = await target(); const d = await queued(t);
  assert.equal(d.subject, "Ready for your first SIXFL match?"); assert.equal(d.template?.key, KEY);
  assert.equal(d.status, "QUEUED"); assert.match(d.bodyText, /Shin pads are mandatory/); assert.match(d.bodyText, /maximum of nine/);
  assert.match(d.bodyText, /19:00/); assert.match(d.bodyText, /18:45/); assert.match(d.bodyText, /Test Sports Centre/); assert.match(d.bodyText, /TEST 1AA/);
  assert.match(d.bodyText, /15 minutes before/); assert.doesNotMatch(d.bodyText, /\{\{/);
  assert.match(JSON.stringify(d.variables), /fixtures\?fixtureId=/); assert.ok(await prisma.messageEntry.findFirst({ where: { notificationDispatchId: d.id } }));
  assert.equal(await block(d, now), null);
});
test("48-hour boundary is inclusive, while more than 48 hours is held", async () => {
  const exact = await target(48); await queued(exact);
  const later = await target(48.01); assert.equal(await queue({ teamId: later.team.id, now }), "not_due");
  assert.match(await status(later.team.id, now), /Due .*48 hours/);
});
test("even a newly published fixture five minutes away catches up, but kick-off/past games never do", async () => {
  await queued(await target(5 / 60));
  for (const h of [0, -1]) {
    const t = await target(h); assert.equal(await queue({ teamId: t.team.id, now }), "not_due");
    assert.equal(await queue({ teamId: t.team.id, now, manual: true }), "not_due");
  }
});
test("unpublished, cancelled and postponed-only fixtures do not send", async () => {
  for (const kind of ["draft", "CANCELLED", "POSTPONED"]) {
    const t = await target(); await prisma.fixture.update({ where: { id: t.fixture.id }, data: kind === "draft" ? { publishedAt: null } : { status: kind as "CANCELLED" | "POSTPONED" } });
    assert.equal(await queue({ teamId: t.team.id, now }), "not_due");
  }
});
test("old unpublished/cancelled/postponed fixtures do not disqualify a genuinely new team", async () => {
  for (const kind of ["draft", "CANCELLED", "POSTPONED"]) {
    const t = await target(); await extra(t, -100, kind === "draft" ? "SCHEDULED" : kind as "CANCELLED" | "POSTPONED", kind !== "draft");
    await queued(t);
  }
});
test("completed games, recorded results and an earlier published past fixture prevent false first-match emails", async () => {
  for (const kind of ["COMPLETED", "result", "missing_result"]) {
    const t = await target(); const old = await extra(t, -100, kind === "COMPLETED" ? "COMPLETED" : "SCHEDULED");
    if (kind === "result") await prisma.matchResult.create({ data: { fixtureId: old.id, homeScore: 1, awayScore: 0 } });
    assert.equal(await queue({ teamId: t.team.id, now }), "not_due");
  }
});
test("a team's old league history is checked rather than restarting first-match onboarding each season", async () => {
  const t = await target(); const previous = await prisma.league.create({ data: { name: randomUUID(), slug: randomUUID() } });
  await prisma.fixture.create({ data: { leagueId: previous.id, homeTeamId: t.team.id, awayTeamId: t.opponent.id, kickoffAt: at(-1000), publishedAt: at(-1100), status: "COMPLETED" } });
  assert.equal(await queue({ teamId: t.team.id, now }), "not_due");
});
test("legacy onboarding marker and old sent/queued firstFixture dispatches suppress a second automatic email", async () => {
  const t = await target(); await prisma.$executeRaw(Prisma.sql`UPDATE "Team" SET "onboardingFirstFixtureEmailSentAt" = ${at(-100)} WHERE id = ${t.team.id}`);
  assert.equal(await queue({ teamId: t.team.id, now }), "not_due"); assert.match(await status(t.team.id, now), /Previously recorded.*no automatic resend/);
  for (const state of ["QUEUED", "SENT", "FAILED", "CANCELLED", "SKIPPED", "PROCESSING"] as const) {
    const p = await target(); const recipient = await prisma.notificationRecipient.create({ data: { sourceType: "TEAM", sourceId: p.team.id, audience: "TEAM", email: p.team.contactEmail } });
    await prisma.notificationDispatch.create({ data: { sourceType: "TEAM", sourceId: p.team.id, recipientId: recipient.id, channel: "EMAIL", audience: "TEAM", bodyText: "Historical reminder", status: state,
      metadata: { type: "captain_onboarding", stage: "firstFixture" } } });
    assert.equal(await queue({ teamId: p.team.id, now }), "not_due"); assert.equal((await dispatches(p)).length, 1);
  }
});
test("concurrent cron/manual requests queue only one message", async () => {
  const t = await target(); const results = await Promise.all([queue({ teamId: t.team.id, now }), queue({ teamId: t.team.id, now, manual: true }), queue({ teamId: t.team.id, now })]);
  assert.equal(results.filter(x => x === "queued").length, 1); assert.equal((await dispatches(t)).length, 1);
});
test("fixture postponement, unpublishing, kickoff, venue, opponent and contact changes block stale delivery", async () => {
  for (const kind of ["POSTPONED", "CANCELLED", "unpublish", "time", "venue", "opponent", "email"]) {
    const t = await target(); const d = await queued(t);
    if (kind === "email") await prisma.team.update({ where: { id: t.team.id }, data: { contactEmail: "changed@example.invalid" } });
    else if (kind === "venue") await prisma.venue.update({ where: { id: t.venue.id }, data: { address: "A different address" } });
    else if (kind === "opponent") await prisma.team.update({ where: { id: t.opponent.id }, data: { name: "New opponent name" } });
    else await prisma.fixture.update({ where: { id: t.fixture.id }, data: kind === "unpublish" ? { publishedAt: null } : kind === "time" ? { kickoffAt: at(12) } : { status: kind as "CANCELLED" | "POSTPONED" } });
    assert.ok(await block(d, now), kind);
  }
});
test("a queued message is cancelled once kick-off arrives", async () => {
  const t = await target(); const d = await queued(t); assert.ok(await block(d, t.fixture.kickoffAt));
});
test("suppression and email opt-out are respected at queue and rechecked before delivery", async () => {
  const t = await target(); const r = await prisma.notificationRecipient.create({ data: { sourceType: "TEAM", sourceId: t.team.id, audience: "TEAM", email: t.team.contactEmail, transactionalEmailOptIn: false } });
  assert.equal(await queue({ teamId: t.team.id, now }), "not_due"); assert.equal((await dispatches(t))[0].status, "SKIPPED");
  assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: r.id } })).transactionalEmailOptIn, false);
  const p = await target(); const d = await queued(p); await prisma.notificationRecipient.update({ where: { id: d.recipientId }, data: { isSuppressed: true } }); assert.ok(await block(d, now));
});
test("missing contact and placeholder team produce no automatic send", async () => {
  const t = await target(); await prisma.team.update({ where: { id: t.team.id }, data: { contactEmail: null } }); assert.equal(await queue({ teamId: t.team.id, now }), "missing_email");
  const p = await target(); await prisma.$executeRaw(Prisma.sql`UPDATE "Team" SET "isFixturePlaceholder" = true WHERE id = ${p.team.id}`); assert.equal(await queue({ teamId: p.team.id, now }), "not_due");
});
test("template edits and disabled state survive migration reruns; disabled template creates no attempt", async () => {
  const saved = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: KEY } });
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { subject: "My special reminder {{teamName}}", body: "Hi {{captainName}}, {{fixtureName}}", isActive: false } });
  migrate(migration);
  const kept = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: KEY } }); assert.equal(kept.isActive, false); assert.match(kept.subject!, /My special/);
  const t = await target(); assert.equal(await queue({ teamId: t.team.id, now }), "not_due"); assert.equal((await dispatches(t)).length, 0);
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { isActive: true } });
  const d = await queued(t); assert.match(d.subject!, /My special reminder/);
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { subject: saved.subject, body: originalBody, isActive: true } });
});
test("actual sent timestamp is separate from queued status and page rendering sends nothing", async () => {
  const t = await target(); const html = renderToStaticMarkup(await FirstMatchReadyStatus({ teamId: t.team.id }));
  assert.match(html, /First-match briefing/); assert.equal((await dispatches(t)).length, 0);
  const d = await queued(t); assert.match(await status(t.team.id, now), /^QUEUED/);
  await prisma.notificationDispatch.update({ where: { id: d.id }, data: { status: "SENT", sentAt: now } }); assert.match(await status(t.team.id, now), /^SENT/);
});
test("legacy manual entry and existing cron use the new shared implementation with same-day catch-up", async () => {
  const t = await target(); await prisma.fixture.update({ where: { id: t.fixture.id }, data: { kickoffAt: new Date(Date.now() + 8 * 3600_000) } });
  assert.equal(await queueCaptainOnboardingEmailForTeam({ teamId: t.team.id, stage: "firstFixture" }), "queued");
  const p = await target(); await prisma.fixture.update({ where: { id: p.fixture.id }, data: { kickoffAt: new Date(Date.now() + 8 * 3600_000) } });
  await runCaptainOnboardingEmailJob(); assert.equal((await dispatches(p)).filter(d => d.template?.key === KEY).length, 1);
  await runCaptainOnboardingEmailJob(); assert.equal((await dispatches(p)).filter(d => d.template?.key === KEY).length, 1);
});
test("final source retains the new timing policy, editable template sender and delivery gate", () => {
  const source = readFileSync("src/lib/captain/onboarding-emails.ts", "utf8"); assert.doesNotMatch(source, /STAGE_CONTENT|sevenDaysFromNow|queueDirectNotification/); assert.match(source, /queueFirstMatchReadyEmail/);
  const processor = readFileSync("src/lib/notifications/processor.ts", "utf8");
  const guarded = (s: string) => 0 <= s.indexOf("await getFirstMatchReadyDeliveryBlock(dispatch)") && s.indexOf("await getFirstMatchReadyDeliveryBlock(dispatch)") < s.indexOf("const sendResult = await sendEmailWithResend");
  assert.ok(guarded(processor)); assert.equal(guarded(processor.replace("await getFirstMatchReadyDeliveryBlock(dispatch)", "null")), false);
  assert.match(readFileSync("src/app/api/cron/notifications/route.ts", "utf8"), /runCaptainOnboardingEmailJob/);
});
