const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const template = fs.readFileSync('src/app/captain/team/[teamid]/template.tsx', 'utf8');
const helper = fs.readFileSync('src/components/captain/CaptainTeamScrollToTop.tsx', 'utf8');

test('captain team routes start at the top without breaking query or hash navigation', () => {
  assert.match(template, /CaptainTeamScrollToTop/);
  assert.match(helper, /usePathname/);
  assert.match(helper, /lastCaptainPathname/);
  assert.match(helper, /window\.location\.hash/);
  assert.match(helper, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
});

test('scroll reset uses native React route state and no DOM bridge', () => {
  assert.doesNotMatch(helper, /MutationObserver|document\.querySelector|document\.querySelectorAll/);
});
