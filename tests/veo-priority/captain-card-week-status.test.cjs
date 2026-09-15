const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const path = 'src/components/captain/CaptainVeoPriorityCard.tsx';
const source = fs.readFileSync(path, 'utf8');

test('captain Veo card distinguishes this week filming status', () => {
  assert.match(source, /VeoMatchBooking/);
  assert.match(source, /IYYY-IW/);
  assert.match(source, /booking\.state NOT IN \('FAILED', 'CANCELLED'\)/);
  assert.match(source, /Your match isn’t being recorded this week\./);
  assert.match(source, /Your match is scheduled to be recorded this week\./);
  assert.match(source, /next week’s match recorded/);
  assert.match(source, /improves your chance of being selected/);
  assert.match(source, /does not guarantee a recording/);
  assert.match(source, /£5 extra for the whole team/);
  assert.match(source, /No filming space or no usable recording means no extra charge/);
});

test('the not-recorded wording is gated to teams with a fixture this week and no active Veo booking', () => {
  assert.match(source, /const notFilmedThisWeek=weekStatus\.hasMatchThisWeek&&!weekStatus\.veoBooked/);
  assert.match(source, /const filmedThisWeek=weekStatus\.hasMatchThisWeek&&weekStatus\.veoBooked/);
  assert.match(source, /notFilmedThisWeek\?'View Veo Priority options':'Open fixtures and choose Veo'/);
});
