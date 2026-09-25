const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { harness } = require('./load.cjs');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/sixfl_catterick_test', 'disposable local test database only');
process.env.NEXTAUTH_SECRET = 'catterick-synthetic-test-secret-only';
const db = new PrismaClient();
const h = harness(db);
const central = h.load('src/lib/leads/teamPlaceConfirmation.ts');
const { recordIndividualPlayerChoice, TeamLeadPlayerChoiceError } = h.load('src/lib/leads/team-lead-player-choice.ts');
const { getTeamLeadChaseBlockReason } = h.load('src/lib/leads/team-lead-chases.ts');
const key = 'catterick-team-interest-october-2026';
const seed = fs.readFileSync('prisma/migrations/20260926001000_catterick_team_interest_campaign/migration.sql', 'utf8');
const originalDate = new Date('2026-09-01T12:00:00Z');
async function lead(id, extra = {}) {
  return db.interestLead.create({ data: {
    id, interestType: 'TEAM', status: 'CONTACTED', contactName: 'Synthetic Alex', email: `${id}@example.invalid`,
    phone: '07700 900123', phoneNormalized: '+447700900123', area: 'Richmond', teamName: 'Synthetic team enquiry',
    message: 'Original enquiry note', source: 'Synthetic Catterick campaign test', marketingConsent: true,
    contactedAt: originalDate, createdAt: originalDate, ...extra,
  } });
}
async function state(id) {
  return { lead: await db.interestLead.findUnique({ where: { id } }), confirmation: await central.getTeamPlaceConfirmationStatus(id) };
}

test('disposable campaign and signed player-choice lifecycle', async t => {
  try {
    // Read the regclass as text because Prisma does not decode the regclass type.
    // Use the existing migration's DDL and real unique constraints for this table.
    const [table] = await db.$queryRawUnsafe(`SELECT to_regclass('"LeadTeamConfirmation"')::text AS name`);
    if (!table.name) {
      const ddl = fs.readFileSync('prisma/migrations/20260627093000_team_lead_confirmation/migration.sql', 'utf8').split('INSERT INTO "EmailTemplate"')[0];
      for (const statement of ddl.split(';').map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    }

    await t.test('migration creates one normal template, preserves edits and queues nothing', async () => {
      const before = await db.notificationDispatch.count();
      await db.$executeRawUnsafe(seed); await db.$executeRawUnsafe(seed);
      assert.equal(await db.emailTemplate.count({ where: { key } }), 1);
      let template = await db.emailTemplate.findUnique({ where: { key } });
      assert.equal(template.audience, 'LEAD'); assert.equal(template.interestType, 'TEAM');
      assert.equal(template.ctaUrlKey, 'teamConfirmationUrl');
      assert.match(template.body, /Monday 5 October/);
      assert.equal(await db.notificationTemplate.count({ where: { key } }), 0);
      assert.equal(await db.notificationDispatch.count(), before);
      await db.emailTemplate.update({ where: { key }, data: { subject: 'Administrator edit', isActive: false } });
      await db.$executeRawUnsafe(seed);
      template = await db.emailTemplate.findUnique({ where: { key } });
      assert.equal(template.subject, 'Administrator edit'); assert.equal(template.isActive, false);
    });

    await t.test('choice updates the same lead, preserves details and cancels only unsent team chases', async () => {
      const before = await lead('player-choice');
      await db.interestLeadPreferredNight.create({ data: { leadId: before.id, night: 'MONDAY' } });
      const recipient = await db.notificationRecipient.create({ data: { sourceType: 'LEAD', sourceId: before.id, audience: 'LEAD', email: before.email } });
      const dispatch = async (id, extra = {}) => db.notificationDispatch.create({ data: {
        id, recipientId: recipient.id, channel: 'EMAIL', audience: 'LEAD', bodyText: 'Inert synthetic test only',
        sourceType: 'LEAD_TEAM_CONFIRMATION', sourceId: before.id, ...extra,
      } });
      await dispatch('queued'); await dispatch('failed', { status: 'FAILED' });
      await dispatch('processing', { status: 'PROCESSING' });
      await dispatch('accepted', { providerMessageId: 'synthetic-provider-acceptance' });
      await dispatch('unrelated', { sourceType: 'UNRELATED_MESSAGE' });
      await dispatch('other-lead', { sourceId: 'another-lead' });
      const result = await recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(before.id));
      assert.equal(result.cancelledCount, 2); assert.equal(result.processingCount, 1);
      let current = await state(before.id);
      assert.equal(current.lead.interestType, 'PLAYER'); assert.equal(current.lead.status, 'NEW');
      assert.equal(current.confirmation.status, 'DECLINED');
      for (const field of ['id', 'contactName', 'email', 'phone', 'phoneNormalized', 'area', 'teamName', 'source', 'marketingConsent', 'leagueId', 'createdAt', 'contactedAt']) {
        assert.deepEqual(current.lead[field], before[field], field);
      }
      assert.ok(current.lead.message.startsWith('Original enquiry note'));
      assert.equal(await db.interestLeadPreferredNight.count({ where: { leadId: before.id, night: 'MONDAY' } }), 1);
      for (const id of ['queued', 'failed']) assert.equal((await db.notificationDispatch.findUnique({ where: { id } })).status, 'CANCELLED');
      assert.equal((await db.notificationDispatch.findUnique({ where: { id: 'processing' } })).status, 'PROCESSING');
      for (const id of ['accepted', 'unrelated', 'other-lead']) assert.equal((await db.notificationDispatch.findUnique({ where: { id } })).status, 'QUEUED');
      assert.ok(await getTeamLeadChaseBlockReason({ sourceType: 'LEAD_TEAM_CONFIRMATION', sourceId: before.id }));
      const note = current.lead.message;
      assert.equal((await recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(before.id))).alreadyRecorded, true);
      current = await state(before.id); assert.equal(current.lead.message, note);
      assert.equal(await db.interestLead.count({ where: { email: before.email } }), 1);
      assert.equal(await db.user.count(), 0); assert.equal(await db.team.count(), 0);
      assert.equal(await db.paymentCharge.count(), 0);
    });

    await t.test('bad signature and processed team enquiries fail without changing data', async () => {
      await assert.rejects(recordIndividualPlayerChoice('tampered.token'), e => e instanceof TeamLeadPlayerChoiceError && e.code === 'invalid');
      for (const [suffix, extra] of [['closed', { status: 'CLOSED' }], ['qualified', { status: 'QUALIFIED' }], ['converted', { convertedAt: new Date() }], ['referee', { interestType: 'REFEREE' }]]) {
        const saved = await lead(`blocked-${suffix}`, extra);
        await assert.rejects(recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(saved.id)), /cannot be changed/);
        assert.deepEqual((await state(saved.id)).lead, saved);
      }
      const confirmed = await lead('confirmed'); await central.confirmTeamPlaceFromLead(confirmed.id);
      await assert.rejects(recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(confirmed.id)), /cannot be changed/);
      assert.equal((await state(confirmed.id)).confirmation.status, 'CONFIRMED');
    });

    await t.test('a cancellation failure rolls back both classification and decision', async () => {
      const saved = await lead('rollback');
      const failure = harness(db, { [path.resolve('src/lib/leads/team-lead-chases')]: {
        cancelUnsentTeamLeadChases: async () => { throw Error('Injected cancellation failure'); },
      } }).load('src/lib/leads/team-lead-player-choice.ts');
      await assert.rejects(failure.recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(saved.id)), /Injected cancellation failure/);
      const current = await state(saved.id); assert.deepEqual(current.lead, saved); assert.equal(current.confirmation, null);
    });

    await t.test('concurrent team and individual choices cannot produce a player with team confirmation', async () => {
      for (let i = 0; i < 4; i++) {
        const saved = await lead(`race-${i}`);
        const outcomes = await Promise.allSettled([
          recordIndividualPlayerChoice(central.createTeamPlaceConfirmationToken(saved.id)),
          central.confirmTeamPlaceFromLead(saved.id),
        ]);
        assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
        const current = await state(saved.id);
        if (current.lead.interestType === 'PLAYER') {
          assert.equal(current.lead.status, 'NEW'); assert.equal(current.confirmation.status, 'DECLINED');
          await assert.rejects(central.confirmTeamPlaceFromLead(saved.id), /no longer a team enquiry/);
        } else {
          assert.equal(current.lead.status, 'QUALIFIED'); assert.equal(current.confirmation.status, 'CONFIRMED');
        }
      }
    });
  } finally { await db.$disconnect(); }
});
