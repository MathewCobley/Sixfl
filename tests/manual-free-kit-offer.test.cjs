const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const action = fs.readFileSync('src/app/(admin)/admin/teams/[id]/free-kit-actions.ts', 'utf8');
const control = fs.readFileSync('src/components/admin/teams/FreeKitOfferControl.tsx', 'utf8');
const mount = fs.readFileSync('src/components/admin/teams/TeamShinPadWarningPanel.tsx', 'utf8');
const eligibility = fs.readFileSync('src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts', 'utf8');
const migration = fs.readFileSync('prisma/migrations/20260913184000_team_free_kit_offer_audit/migration.sql', 'utf8');

test('manual grant uses the existing team entitlement flag and is audited', () => {
  assert.match(action, /UPDATE "Team"/);
  assert.match(action, /"wantsFreeKit" = \$\{enabled\}/);
  assert.match(action, /INSERT INTO "TeamFreeKitOfferAudit"/);
  assert.match(action, /actorUserId/);
  assert.match(action, /reason/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "TeamFreeKitOfferAudit"/);
});

test('captain kit eligibility already recognises the manually granted team flag', () => {
  assert.match(eligibility, /kit_team\."wantsFreeKit" = TRUE/);
  assert.match(eligibility, /lead\."wantsFreeKit" = TRUE/);
  assert.match(eligibility, /const INCLUDED_KIT_QUANTITY = 7/);
  assert.match(eligibility, /const EXTRA_KIT_PRICE_PENCE = 2000/);
});

test('original-registration offers and in-use offers cannot be manually removed', () => {
  assert.match(action, /ORIGINAL_REGISTRATION_OFFER/);
  assert.match(action, /OFFER_IN_USE/);
  assert.match(action, /FROM "TeamKitOrder"/);
  assert.match(action, /FROM "PaymentCharge"/);
});

test('team overview exposes explicit grant and removal controls', () => {
  assert.match(mount, /FreeKitOfferControl/);
  assert.match(control, /Grant 7 free kits/);
  assert.match(control, /Remove manual offer/);
  assert.match(control, /Original registration/);
  assert.match(control, /Manually granted/);
  assert.match(control, /Additional complete kits cost/);
});

test('manual entitlement action does not alter league, squad, fixture or match-fee records', () => {
  assert.doesNotMatch(action, /TeamMember"\s+(?:SET|DELETE|INSERT)/i);
  assert.doesNotMatch(action, /UPDATE "League"/);
  assert.doesNotMatch(action, /UPDATE "Fixture"/);
  assert.doesNotMatch(action, /UPDATE "PaymentCharge"/);
  assert.match(action, /revalidatePath\(`\/captain\/team\/\$\{teamId\}\/kit`\)/);
});
