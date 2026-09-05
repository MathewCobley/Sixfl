import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { processRefereeEvening, respondToEveningToken, getEveningConfirmation } from "../src/lib/referees/evening-notifications";
import { EVENING_SOURCE } from "../src/lib/referees/evening-policy";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_ISOLATED_REFEREE_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_referee_test", "Disposable CI database only; run after the migration suite.");
after(async () => { await prisma.$disconnect(); });

test("one answer synchronises two financial nights without changing their fees", async () => {
  const id = randomUUID();
  const ref = await prisma.user.create({ data: { name: "Multi-league test referee", role: "REFEREE", email: `${id}@example.invalid` } });
  const venue = await prisma.venue.create({ data: { name: "Shared test venue" } });
  const home = await prisma.team.create({ data: { name: "Home", claimCode: `${id}-home` } });
  const away = await prisma.team.create({ data: { name: "Away", claimCode: `${id}-away` } });
  const first = new Date(); first.setUTCDate(first.getUTCDate() + 5); first.setUTCHours(18, 0, 0, 0);
  let firstFixtureId = "";
  for (let i = 0; i < 2; i++) {
    const league = await prisma.league.create({ data: { name: `Test competition ${i}`, slug: `${id}-${i}` } });
    await prisma.$executeRaw(Prisma.sql`UPDATE "League" SET "minutesPerGame" = 40 WHERE id = ${league.id}`);
    const fixture = await prisma.fixture.create({ data: {
      leagueId: league.id, refereeId: ref.id, homeTeamId: home.id, awayTeamId: away.id,
      venueId: venue.id, kickoffAt: new Date(first.getTime() + i * 40 * 60_000), publishedAt: new Date(),
    } });
    if (i === 0) firstFixtureId = fixture.id;
    const nightId = randomUUID();
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "RefereeNight" (id, "refereeId", "leagueId", "venueId", "nightDate", "feePence")
      VALUES (${nightId}, ${ref.id}, ${league.id}, ${venue.id}, (${first}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date, ${1000 + i * 100})`);
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "RefereeNightFixture" (id, "refereeNightId", "fixtureId") VALUES (${randomUUID()}, ${nightId}, ${fixture.id})`);
  }
  const groups = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "RefereeEveningNotice" WHERE "refereeId" = ${ref.id}`);
  assert.equal(groups.length, 1);
  const settled = new Date(Date.now() + 61 * 60_000);
  await processRefereeEvening(groups[0].id, settled);
  const emails = await prisma.notificationDispatch.findMany({ where: { sourceType: EVENING_SOURCE, sourceId: groups[0].id } });
  assert.equal(emails.length, 1);
  const token = (emails[0].variables as Record<string, string>).confirmationUrl.split("/").at(-1)!;
  await prisma.notificationDispatch.update({ where: { id: emails[0].id }, data: { status: "SENT", sentAt: settled } });
  assert.equal(await respondToEveningToken(token, "yes"), true);
  const readNights = () => prisma.$queryRaw<Array<{ confirmationStatus: string; confirmationConfirmedAt: Date | null; feePence: number }>>(Prisma.sql`
    SELECT "confirmationStatus", "confirmationConfirmedAt", "feePence" FROM "RefereeNight" WHERE "refereeId" = ${ref.id} ORDER BY "feePence"`);
  let nights = await readNights();
  assert.equal(nights.length, 2);
  assert.ok(nights.every((n) => n.confirmationStatus === "CONFIRMED" && n.confirmationConfirmedAt instanceof Date));
  assert.deepEqual(nights.map((n) => n.feePence), [1000, 1100]);
  await prisma.fixture.update({ where: { id: firstFixtureId }, data: { kickoffAt: new Date(first.getTime() - 10 * 60_000) } });
  assert.equal(await getEveningConfirmation(token), null);
  await processRefereeEvening(groups[0].id, new Date(Date.now() + 61 * 60_000));
  nights = await readNights();
  assert.ok(nights.every((n) => n.confirmationStatus === "PENDING" && n.confirmationConfirmedAt === null));
  assert.deepEqual(nights.map((n) => n.feePence), [1000, 1100]);
});
