const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('../result-overturn/loader.cjs');

function actions(state) {
  return load('src/app/(admin)/admin/referrals/actions.ts', {
    '@/lib/prisma': { prisma: {} }, '@/lib/requireAdmin': { requireAdmin: async () => ({ user: state.user }) },
    '@/lib/team-referral-payout': {}, '@/lib/team-referral-notifications': {}, '@/lib/team-referrals': {},
    '@/lib/team-referral-eligibility': { ReferralEligibilityError: Error, markReferralIneligible: async () => { if (state.decisionFails) throw Error('not saved'); state.saved = true; } },
    '@/lib/referral-ineligibility-email': { queueReferralIneligibilityEmail: async input => {
      assert.equal(state.saved, true); state.calls.push(input);
      if (!input.confirmed || state.emailFails) throw Error('not queued');
      return { dispatchId: 'dispatch', status: 'QUEUED', existing: false };
    } },
    'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: p => { throw Error(p); } },
  });
}
function form(values) { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; }

test('new confirmed decision requests one safe email after save; old forms remain explicit catch-up', async () => {
  const state = { user: { id: 'admin', role: 'ADMIN' }, saved: false, calls: [] };
  const api = actions(state);
  const f = form({ referralId: 'exact', reasonCode: 'EXISTING_TEAM', note: 'PRIVATE_NOTE', confirmed: 'yes', notifyReferrer: 'yes', actorUserId: 'forged', body: 'SECRET_BODY', recipient: 'wrong@example.invalid' });
  await assert.rejects(api.markReferralIneligibleAction(f), /ineligible=1&eligibilityNotice=queued/);
  assert.deepEqual(state.calls, [{ referralId: 'exact', actorUserId: 'admin', confirmed: true }]);
  state.calls = []; f.delete('notifyReferrer');
  await assert.rejects(api.markReferralIneligibleAction(f), /eligibilityNotice=not_requested/); assert.equal(state.calls.length, 0);
});

test('email failures preserve decision; failed decisions and non-admins never request an email', async () => {
  const state = { user: { id: 'admin', role: 'ADMIN' }, saved: false, calls: [], emailFails: true };
  const f = form({ referralId: 'exact', confirmed: 'yes', notifyReferrer: 'yes' });
  await assert.rejects(actions(state).markReferralIneligibleAction(f), /ineligible=1&eligibilityNotice=failed/); assert.equal(state.saved, true);
  state.decisionFails = true; state.calls = [];
  await assert.rejects(actions(state).markReferralIneligibleAction(f), /eligibilityError=/); assert.equal(state.calls.length, 0);
  for (const user of [null, { id: 'captain', role: 'USER' }]) {
    state.user = user;
    await assert.rejects(actions(state).emailIneligibleReferralAction(f), /Administrator/);
    await assert.rejects(actions(state).markReferralIneligibleAction(f), /Administrator/);
  }
});

test('saved-decision catch-up uses only referral id, real actor and confirmation', async () => {
  const state = { user: { id: 'admin', role: 'ADMIN' }, saved: true, calls: [] };
  await assert.rejects(actions(state).emailIneligibleReferralAction(form({ referralId: 'old-decision', confirmed: 'yes', note: 'PRIVATE', body: 'PRIVATE', actorUserId: 'forged' })), /eligibilityNotice=queued/);
  assert.deepEqual(state.calls, [{ referralId: 'old-decision', actorUserId: 'admin', confirmed: true }]);
});

test('only template-backed public fields are used; no automatic backfill or providers', () => {
  const service = fs.readFileSync('src/lib/referral-ineligibility-email.ts', 'utf8');
  assert.doesNotMatch(service, /ineligibleNote|evidenceNote|rulesBasis|payoutDetails|ineligibleByName|queueDirectNotification|sendEmailWith|processNotificationQueue/);
  assert.match(service, /queueNotificationFromTemplate/); assert.match(service, /FOR UPDATE OF r/);
  const migration = fs.readFileSync('prisma/migrations/20260912203000_referral_ineligibility_email/migration.sql', 'utf8');
  assert.match(migration, /ON CONFLICT \("key"\) DO NOTHING/); assert.match(migration, /CREATE UNIQUE INDEX/);
  assert.doesNotMatch(migration, /INSERT INTO "NotificationDispatch"|UPDATE "TeamReferral"/);
  assert.match(fs.readFileSync('src/app/(admin)/admin/referrals/page.tsx','utf8'), /ReferralIneligibilityEmailPanel/);
});
