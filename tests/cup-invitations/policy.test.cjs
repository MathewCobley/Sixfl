const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {load} = require('../result-overturn/loader.cjs');
const p=load('src/lib/cups/invitation-policy.ts');
process.env.NEXTAUTH_SECRET='isolated-cup-tests-not-a-live-key';
test('signed response capabilities reject tampering, expiry and wrong format',()=>{
  const now=Date.now(),token=p.cupResponseToken('message-one',new Date(now+60000));
  assert.equal(p.readCupResponseToken(token,now).messageId,'message-one');
  for(const invalid of [token+'x','untrusted',token.replace(token[0],token[0]==='a'?'b':'a'),'a'.repeat(1025)])assert.throws(()=>p.readCupResponseToken(invalid,now));
  assert.throws(()=>p.readCupResponseToken(token,now+61000));
});
test('counts reflect teams, keep confirmed entries separate and filter the export',()=>{
  const rows=['YES','NO','PENDING','NOT_INVITED','OUTDATED'].map((response,i)=>({teamName:'Team '+i,sourceLeagueId:i%2?'B':'A',response,entered:i===1,deliveryProblem:i===2}));
  assert.deepEqual(p.summaryCounts(rows),{invited:4,yes:1,no:1,pending:1,outdated:1,entrants:1,problems:1});
  assert.equal(p.filterCupRows(rows,{league:'A'}).length,3);
  assert.equal(p.filterCupRows(rows,{response:'PROBLEM'})[0].teamName,'Team 2');
  assert.equal(p.filterCupRows(rows,{q:'TEAM 3'}).length,1);
  assert.equal(p.csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
});
test('GET response page only reads; Yes/No require a POST confirmation and concurrency version',()=>{
  const page=fs.readFileSync('src/app/cup-invitation/[token]/page.tsx','utf8');
  assert.match(page,/getCupResponseContext/); assert.doesNotMatch(page,/respondToCup|\$executeRaw|\.update\(/);
  const form=fs.readFileSync('src/components/cups/CupResponseForm.tsx','utf8');
  assert.match(form,/confirmed/);assert.match(form,/version/);assert.match(form,/type="radio"/);
  const service=fs.readFileSync('src/lib/cups/invitations.ts','utf8');
  assert.match(service,/Only a current team captain can respond/);
  assert.match(service,/responseVersion!==input.expectedVersion/);
  assert.doesNotMatch(service,/team\.update|fixture\.create|paymentCharge\.create|queueDirectNotification|sendEmail/);
});
test('renderer turns editable template labels into two genuine response links',()=>{
  const source=fs.readFileSync('prisma/migrations/20260913001000_cup_invitations/migration.sql','utf8');
  assert.match(source,/ON CONFLICT \("key"\) DO NOTHING/);
  const {buildSIXFLEmailHtml}=load('src/lib/email/buildEmail.ts');
  const html=buildSIXFLEmailHtml({subject:'Example cup',body:'Cup invitation\n\nSIXFL_POLL_OPTIONS_START\nYes — interested: https://example.invalid/yes\nNo — not this time: https://example.invalid/no\nSIXFL_POLL_OPTIONS_END'});
  assert.match(html,/href="https:\/\/example.invalid\/yes"/);assert.match(html,/href="https:\/\/example.invalid\/no"/);
  assert.doesNotMatch(html,/SIXFL_POLL_OPTIONS_START/);
});
