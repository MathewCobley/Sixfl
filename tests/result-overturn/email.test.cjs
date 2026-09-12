const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./loader.cjs');
const { buildResultOverturnEmail } = load('src/lib/fixtures/result-overturn-email-content.ts');
const { describeResultOverturn, RESULT_OVERTURN_SUMMARY_SELECT } = load('src/lib/fixtures/result-score.ts');
const facts = {homeTeamName:'Northallerton Nomads',awayTeamName:'Under Sixes',originalHomeScore:1,originalAwayScore:4,awardedHomeScore:3,awardedAwayScore:0,reasonCode:'PLAYER_LIMIT',kickoffAt:new Date('2026-09-09T20:15:00Z')};

test('email clearly states played 1–4, official 3–0 and named default winner for rule breach', () => {
  const message = buildResultOverturnEmail(facts);
  assert.match(message.body,/Original on-pitch result: Northallerton Nomads 1–4 Under Sixes/);
  assert.match(message.body,/Official awarded result: Northallerton Nomads 3–0 Under Sixes/);
  assert.match(message.body,/Northallerton Nomads have been awarded a 3–0 default win for a rule breach/);
  assert.match(message.body,/Reason: Player-limit breach\./);assert.match(message.body,/9 September 2026/);
  assert.deepEqual(buildResultOverturnEmail({...facts, evidenceNote:'SECRET_EVIDENCE', rulesBasis:'SECRET_RULES', body:'FORGED_COPY', subject:'FORGED_SUBJECT'}),message);
});
test('default winner is derived from the awarded scores, not the original winner or fixture order',()=>{
  const reversed={...facts,homeTeamName:'Under Sixes',awayTeamName:'Northallerton Nomads',originalHomeScore:4,originalAwayScore:1,awardedHomeScore:0,awardedAwayScore:3};
  const message=buildResultOverturnEmail(reversed);
  assert.match(message.body,/Official awarded result: Under Sixes 0–3 Northallerton Nomads/);
  assert.match(message.body,/Northallerton Nomads have been awarded a 3–0 default win/);
  assert.equal(describeResultOverturn(facts,facts.homeTeamName,facts.awayTeamName).winner,'Northallerton Nomads');
  assert.equal(RESULT_OVERTURN_SUMMARY_SELECT.awardedHomeScore,true);
  assert.equal(RESULT_OVERTURN_SUMMARY_SELECT.awardedAwayScore,true);
});
test('invalid award, missing original evidence and arbitrary reason text cannot generate an email',()=>{
  for(const patch of [{awardedAwayScore:3},{originalHomeScore:null},{originalHomeScore:-1},{reasonCode:'SECRET_FREE_FORM'}]) assert.throws(()=>buildResultOverturnEmail({...facts,...patch}));
});
test('service uses an explicit public-field projection and never queues submitted admin text',()=>{
  const source=fs.readFileSync('src/lib/fixtures/result-overturn-email.ts','utf8');
  assert.doesNotMatch(source,/evidenceNote|rulesBasis|include:\s*\{\s*overturn:\s*true/);
  assert.match(source,/NotificationChannel.EMAIL/);assert.doesNotMatch(source,/NotificationChannel.SMS/);
  assert.match(source,/pg_advisory_xact_lock/);assert.match(source,/recorded.has\(email\)/);
  assert.doesNotMatch(source,/processNotificationQueue|sendEmailWithResend|paymentCharge\.update|matchResult\.update/);
  const action=fs.readFileSync('src/app/(admin)/admin/fixtures/[id]/result/overturn-email-actions.ts','utf8');
  for(const key of ['body','subject','evidenceNote','rulesBasis','recipient','to']) assert.ok(!action.includes(`form.get("${key}")`),key);
});
