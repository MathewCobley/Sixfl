const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const score = fs.readFileSync('src/lib/sixfl-tv/priority-score.ts', 'utf8');
const allocator = fs.readFileSync('src/lib/veo/allocator.ts', 'utf8');
const bookings = fs.readFileSync('src/lib/veo/fixture-bookings.ts', 'utf8');
const nightBoard = fs.readFileSync('src/lib/veo/night-board.ts', 'utf8');
const captainCard = fs.readFileSync('src/components/captain/CaptainVeoPriorityCard.tsx', 'utf8');
const captainForm = fs.readFileSync('src/components/captain/FixtureVeoConfirmationForm.tsx', 'utf8');
const teamList = fs.readFileSync('src/app/(admin)/admin/teams/page.tsx', 'utf8');
const captainLayout = fs.readFileSync('src/app/captain/team/[teamid]/layout.tsx', 'utf8');
const templateForm = fs.readFileSync('src/components/admin/email-templates/EmailTemplateForm.tsx', 'utf8');
const broadcast = fs.readFileSync('src/lib/communications/send-team-broadcast.ts', 'utf8');
const communicationActions = fs.readFileSync('src/app/(admin)/admin/communications/actions.ts', 'utf8');
const migration = fs.readFileSync('prisma/migrations/20260918123000_sixfl_tv_priority_score/migration.sql', 'utf8');
const weightMigration = fs.readFileSync('prisma/migrations/20260918140000_sixfl_tv_priority_weight_tuning/migration.sql', 'utf8');
const feeRetirementMigration = fs.readFileSync('prisma/migrations/20260918143000_retire_legacy_veo_priority_fees/migration.sql', 'utf8');
const priorityRequests = fs.readFileSync('src/lib/veo/priority-requests.ts', 'utf8');
const adminPriorityPage = fs.readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/page.tsx', 'utf8');
const adminNightPanel = fs.readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/FixtureVeoNightPanel.tsx', 'utf8');
const captainBookings = fs.readFileSync('src/components/captain/CaptainVeoBookings.tsx', 'utf8');
const captainFixtures = fs.readFileSync('src/app/captain/team/[teamid]/fixtures/layout.tsx', 'utf8');

test('Priority score makes the match card the largest factor while keeping late payment costly', () => {
  assert.match(score, /paymentPoints = 6/);
  assert.match(score, /paymentPoints = 2/);
  assert.match(score, /paymentPoints = 0/);
  assert.match(score, /confirmationPoints = 4/);
  assert.match(score, /matchCardPoints = 8/);
  assert.match(score, /assistsPoints = assistsCompleteOnTime \? 1 : 0/);
  assert.match(score, /ratingsPoints = ratingsCompleteOnTime \? 1 : 0/);
  assert.match(score, /SIXFL_TV_PRIORITY_MATCH_COUNT = 5/);
  assert.match(score, /SIXFL_TV_PRIORITY_MIN_SCORE = 60/);
});

test('new Priority allocation is score based and permanently free', () => {
  assert.match(allocator, /homePriorityScore/);
  assert.match(allocator, /qualifyingScores\.reduce/);
  assert.match(allocator, /const supplementPence = 0/);
  assert.doesNotMatch(allocator, /VEO_SUPPLEMENT_PENCE/);
  assert.match(bookings, /getSixflTvPriorityScores/);
  assert.match(bookings, /homePriorityScore:homeScore\?\.score\?\?0/);
  assert.match(bookings, /priorityModel:'SIXFL_TV_SCORE'/);
  assert.match(nightBoard, /noPriorityFees: true/);
  assert.doesNotMatch(nightBoard, /paymentCharge\.create|ensureAcceptedVeoCharges|amountPence:\s*500/);
  assert.doesNotMatch(bookings, /paymentCharge\.create|UPDATE "PaymentCharge"/);
  assert.match(priorityRequests, /Paid Veo Priority has ended/);
  assert.match(priorityRequests, /SET status = 'DECLINED'/);
  assert.doesNotMatch(priorityRequests, /SET status = 'APPROVED'/);
});

test('captains and admins see the same score', () => {
  assert.match(teamList, /SixflTvPriorityScoreBadge/);
  assert.match(teamList, /getSixflTvPriorityScores/);
  assert.match(captainLayout, /SixflTvPriorityScoreBadge/);
  assert.match(captainLayout, /getSixflTvPriorityScore/);
  assert.match(captainCard, /\['8', 'Match card'/);
  assert.match(captainCard, /\['6', 'Payment'/);
  assert.match(captainCard, /Late = 2/);
  assert.match(captainCard, /Match card not completed/);
  assert.match(captainCard, /Available points per match/);
  assert.match(captainCard, /Each completed match is worth up to 20 points/);
  assert.match(captainCard, /What was missing\?/);
  assert.match(captainCard, /pointsMissed/);
  assert.match(captainCard, /missed/);
  assert.match(captainCard, /players who played/);
  assert.match(captainCard, /60\/100/);
  assert.doesNotMatch(captainForm, /£5 extra for the whole team/);
  assert.match(captainForm, /earned automatically/);
});

test('legacy £5 pilot fees are retired without leaving fee UI or double-credit paths', () => {
  for (const source of [adminPriorityPage, adminNightPanel, captainBookings, captainFixtures, captainForm]) {
    assert.doesNotMatch(source, /historic £5|older Veo Priority|Veo supplement value|agreedPence === 500|View Team payments/);
  }
  assert.match(feeRetirementMigration, /title LIKE 'Veo Priority — %'/);
  assert.match(feeRetirementMigration, /"amountPence" = 500/);
  assert.match(feeRetirementMigration, /'CREDIT_ADDED'::"TeamCreditLedgerEntryType"/);
  assert.match(feeRetirementMigration, /COALESCE\(pt\.reference, ''\) <> 'TEAM_CREDIT'/);
  assert.match(feeRetirementMigration, /status = 'VOID'/);
  assert.match(feeRetirementMigration, /"agreedPence" = 0/);
  assert.match(feeRetirementMigration, /DELETE FROM "TeamCreditLedgerEntry"/);
  assert.doesNotMatch(feeRetirementMigration, /DELETE FROM "PaymentCharge"|TRUNCATE|DROP TABLE/);
});

test('email builder exposes and team broadcasts resolve the current score', () => {
  assert.match(templateForm, /\{\{sixflTvPriorityScore\}\}/);
  assert.match(templateForm, /replaceAll\("\{\{sixflTvPriorityScore\}\}","86"\)/);
  assert.match(broadcast, /getSixflTvPriorityScore\(team\.id\)/);
  assert.match(broadcast, /sixflTvPriorityScore: priorityScore\.score/);
  assert.match(communicationActions, /"sixflTvPriorityScore"/);
  assert.match(communicationActions, /sixflTvPriorityScore: priorityScore\.score/);
  assert.match(migration, /INSERT INTO "EmailTemplate"/);
  assert.match(migration, /Your current SIXFL TV Priority Score is \*\*\{\{sixflTvPriorityScore\}\}\/100\*\*/);
  assert.match(weightMigration, /Payment on time — 6 points\. Late payment earns only 2 points\./);
  assert.match(weightMigration, /Core match card completed by 6pm the day after the match — 8 points\./);
  assert.doesNotMatch(migration, /INSERT INTO "NotificationTemplate"[\s\S]*sixfl-tv-priority-launch-email/);
});

test('historic completion evidence is stored without changing later edits', () => {
  assert.match(migration, /priorityCoreCompletedAt/);
  assert.match(migration, /priorityAssistsCompletedAt/);
  assert.match(migration, /priorityRatingsCompletedAt/);
  assert.match(score, /priorityCoreCompletedAt <= cardDeadline/);
});
