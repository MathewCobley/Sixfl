const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const editPage = fs.readFileSync('src/app/(admin)/admin/polls/[id]/edit/page.tsx', 'utf8');
const adminActions = fs.readFileSync('src/app/(admin)/admin/polls/actions.ts', 'utf8');
const pollPage = fs.readFileSync('src/app/polls/[token]/page.tsx', 'utf8');
const pollActions = fs.readFileSync('src/app/polls/[token]/actions.ts', 'utf8');
const quickVote = fs.readFileSync('src/app/polls/[token]/vote/[optionId]/route.ts', 'utf8');
const migration = fs.readFileSync('prisma/migrations/20260915102000_poll_option_followups/migration.sql', 'utf8');

test('poll options persist custom confirmation and follow-up wording', () => {
  assert.match(migration, /"responseMessage" TEXT/);
  assert.match(migration, /"followUpPrompt" TEXT/);
  assert.match(adminActions, /"responseMessage" = \$\{responseMessage\}/);
  assert.match(adminActions, /"followUpPrompt" = \$\{followUpPrompt\}/);
  assert.match(editPage, /optionResponseMessage/);
  assert.match(editPage, /optionFollowUpPrompt/);
});

test('single-choice follow-up is shown only for its selected answer and required server-side', () => {
  assert.match(pollPage, /peer-checked:block/);
  assert.match(pollPage, /name=\{`note_\$\{option\.id\}`\}/);
  assert.match(pollActions, /error=followup&option=/);
  assert.match(pollActions, /primaryOption\?\.followUpPrompt/);
});

test('quick vote cannot bypass an answer-specific follow-up', () => {
  assert.match(quickVote, /poll\.followUpPrompt\?\.trim\(\)/);
  assert.match(quickVote, /redirectToPoll\(token, "followup", optionId\)/);
});

test('saved poll answers can show their option-specific confirmation message', () => {
  assert.match(pollPage, /savedResponseMessages/);
  assert.match(pollPage, /option\.responseMessage\?\.trim\(\)/);
});
