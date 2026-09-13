const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const action = fs.readFileSync('src/app/(admin)/admin/teams/[id]/free-kit-actions.ts', 'utf8');
const warningPanel = fs.readFileSync('src/components/admin/teams/TeamShinPadWarningPanel.tsx', 'utf8');
const settingsBridge = fs.readFileSync('src/components/admin/teams/TeamFreeKitOfferOverrideBridge.tsx', 'utf8');
const adminStatusApi = fs.readFileSync('src/app/api/admin/teams/[teamId]/free-kit-offer-status/route.ts', 'utf8');
const eligibility = fs.readFileSync('src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts', 'utf8');
const migration = fs.readFileSync('prisma/migrations/20260913184000_team_free_kit_offer_audit/migration.sql', 'utf8');

test('manual grant uses the existing team entitlement flag and is audited', () => {
  assert.match(adminStatusApi, /UPDATE "Team"/);
  assert.match(adminStatusApi, /"wantsFreeKit" = \$\{enabled\}/);
  assert.match(adminStatusApi, /INSERT INTO "TeamFreeKitOfferAudit"/);
  assert.match(adminStatusApi, /actorUserId/);
  assert.match(adminStatusApi, /reason/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "TeamFreeKitOfferAudit"/);
});

test('captain kit eligibility already recognises the manually granted team flag', () => {
  assert.match(eligibility, /kit_team\."wantsFreeKit" = TRUE/);
  assert.match(eligibility, /lead\."wantsFreeKit" = TRUE/);
  assert.match(eligibility, /const INCLUDED_KIT_QUANTITY = 7/);
  assert.match(eligibility, /const EXTRA_KIT_PRICE_PENCE = 2000/);
});

test('free-kit grant is shown in Team settings, not the warning panel', () => {
  assert.match(settingsBridge, /findTeamSettingsHost/);
  assert.match(settingsBridge, /Grant 7 free kits/);
  assert.match(settingsBridge, /Manually granted/);
  assert.match(settingsBridge, /Original registration/);
  assert.doesNotMatch(warningPanel, /FreeKitOfferControl/);
  assert.doesNotMatch(warningPanel, /free-kit/i);
});

test('original-registration offers and in-use offers cannot be manually removed', () => {
  assert.match(adminStatusApi, /original-registration free-kit entitlement/);
  assert.match(adminStatusApi, /hasLiveOrder/);
  assert.match(adminStatusApi, /hasExtraKitCharge/);
  assert.match(adminStatusApi, /FROM "TeamKitOrder"/);
  assert.match(adminStatusApi, /FROM "PaymentCharge"/);
});

test('manual entitlement action does not alter league, squad, fixture or match-fee records', () => {
  assert.doesNotMatch(adminStatusApi, /TeamMember"\s+(?:SET|DELETE|INSERT)/i);
  assert.doesNotMatch(adminStatusApi, /UPDATE "League"/);
  assert.doesNotMatch(adminStatusApi, /UPDATE "Fixture"/);
  assert.doesNotMatch(adminStatusApi, /UPDATE "PaymentCharge"/);
  assert.match(action, /revalidatePath\(`\/captain\/team\/\$\{teamId\}\/kit`\)/);
});
