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

test('new Priority allocation is score based and free', () => {
  assert.match(allocator, /homePriorityScore/);
  assert.match(allocator, /qualifyingScores\.reduce/);
  assert.match(allocator, /const supplementPence = 0/);
  assert.match(bookings, /getSixflTvPriorityScores/);
  assert.match(bookings, /homePriorityScore:homeScore\?\.score\?\?0/);
  assert.match(bookings, /priorityModel:'SIXFL_TV_SCORE'/);
  assert.match(nightBoard, /noPriorityFees: true/);
  assert.doesNotMatch(nightBoard, /paymentCharge\.create/);
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
