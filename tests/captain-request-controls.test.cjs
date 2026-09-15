const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports,
  );
  return module.exports;
}
const clientPath = 'src/components/captain/temporary-player-request-client.ts';
const input = { teamId: 'team-a', fixtureId: 'match-a', requestId: 'request-a', decision: 'decline' };
const good = { ok: true, decision: 'declined', player: { displayName: 'Test player' } };
function reply(payload, ok = true, redirected = false) {
  return { ok, redirected, json: async () => payload };
}

test('decline uses the existing authenticated request API without a fee or guest action', async (t) => {
  const client = load(clientPath);
  const seen = [];
  const unsubscribe = client.subscribeToTemporaryPlayerDecisions((value) => seen.push(value));
  let call;
  t.mock.method(global, 'fetch', async (url, options) => { call = { url, options }; return reply(good); });
  await client.decideTemporaryPlayerRequest({ ...input, amount: '12' });
  assert.equal(call.url, '/api/captain/team/team-a/temporary-player-requests');
  assert.equal(call.options.method, 'POST');
  assert.deepEqual(JSON.parse(call.options.body), { fixtureId: 'match-a', requestId: 'request-a', decision: 'decline' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].teamId, input.teamId);
  assert.equal(seen[0].requestId, input.requestId);
  unsubscribe();
  await client.decideTemporaryPlayerRequest(input);
  assert.equal(seen.length, 1);
});

test('accept still sends the captain-entered fee including explicit zero', async (t) => {
  const client = load(clientPath);
  const bodies = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return reply({ ok: true, decision: 'accepted', player: { amountPence: 0 } });
  });
  await client.decideTemporaryPlayerRequest({ ...input, decision: 'accept', amount: '0' });
  await client.decideTemporaryPlayerRequest({ ...input, decision: 'accept', amount: '6.50' });
  assert.equal(bodies[0].amount, '0');
  assert.equal(bodies[1].amount, '6.50');
});

test('errors, sign-in redirects and unconfirmed responses never remove a request', async (t) => {
  const client = load(clientPath);
  let updates = 0;
  client.subscribeToTemporaryPlayerDecisions(() => updates++);
  const responses = [
    reply({ error: 'Request is no longer open' }, false),
    reply(good, true, true),
    reply(null),
    reply({ ok: true, decision: 'accepted' }),
  ];
  t.mock.method(global, 'fetch', async () => responses.shift());
  for (let i = 0; i < 4; i++) await assert.rejects(client.decideTemporaryPlayerRequest(input));
  assert.equal(updates, 0);
});

test('top and lower controls cannot submit competing decisions for one request', async (t) => {
  const client = load(clientPath);
  let finish;
  let calls = 0;
  t.mock.method(global, 'fetch', () => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const first = client.decideTemporaryPlayerRequest(input);
  await assert.rejects(client.decideTemporaryPlayerRequest({ ...input, decision: 'accept', amount: '6' }), /already being updated/);
  assert.equal(calls, 1);
  finish(reply(good));
  await first;
});

test('network failures release the busy lock without reporting success', async (t) => {
  const client = load(clientPath);
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    if (calls === 1) throw new Error('Network unavailable');
    return reply(good);
  });
  await assert.rejects(client.decideTemporaryPlayerRequest(input), /Network unavailable/);
  assert.equal((await client.decideTemporaryPlayerRequest(input)).decision, 'declined');
});

test('the actual shared top banner renders Review request and Decline for each matching request', async () => {
  const request = {
    id: 'request-a', fixtureId: 'match-a', displayName: 'Test player',
    createdAt: new Date(), expiresAt: new Date('2099-01-02'), kickoffAt: new Date('2099-01-01'),
    teamName: 'Test team', opponentName: 'Opponents',
  };
  const navigation = { useRouter: () => ({ refresh() {} }) };
  const Button = load('src/components/captain/TemporaryPlayerRequestDeclineButton.tsx', {
    'next/navigation': navigation,
    './temporary-player-request-client': load(clientPath),
  }).default;
  const Banner = load('src/components/captain/CaptainTemporaryPlayerRequestSummary.tsx', {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@prisma/client': { Prisma: { sql: () => ({}) } },
    '@/lib/datetime/london': { formatDateTimeInLondon: () => 'Test date' },
    '@/lib/prisma': { prisma: { $executeRaw: async () => 0, $queryRaw: async () => [request] } },
    '@/lib/temporary-player-passes': { ensureTemporaryPlayerPassTable: async () => {} },
    './TemporaryPlayerRequestDeclineButton': Button,
  }).default;
  const html = renderToStaticMarkup(await Banner({ teamId: 'team-a' }));
  assert.match(html, />Review request<\/a>/);
  assert.match(html, />Decline<\/button>/);
  assert.match(html, /fixtureId=match-a/);
  assert.match(html, /Decline Test player/);
  assert.match(html, /separate from any guest permission/);
});

test('captain guest copy is rendered without an administrator approval action', () => {
  const Guest = load('src/components/captain/FixtureGuestApprovals.tsx', {
    'next/navigation': {
      useRouter: () => ({ refresh() {} }),
      useSearchParams: () => new URLSearchParams('fixtureId=match-a'),
    },
    './GuestPaymentControl': () => null,
  }).default;
  const html = renderToStaticMarkup(React.createElement(Guest, { teamId: 'team-a', canManage: false }));
  assert.match(html, /Guest players for this match/);
  assert.match(html, /you can set their match fee/);
  assert.match(html, /separate from SIXFL guest permission/);
  assert.doesNotMatch(html, /Approve guest for this fixture|SIXFL admin only|Fixture-specific permission/);
});

test('prepared source retains both controls, shared state updates and server permission boundaries', () => {
  const top = read('src/components/captain/TemporaryPlayerRequestDeclineButton.tsx');
  const panel = read('src/components/captain/TemporaryPlayerRequestsPanel.tsx');
  for (const source of [top, panel]) {
    assert.match(source, /decideTemporaryPlayerRequest/);
    assert.match(source, /subscribeToTemporaryPlayerDecisions/);
    assert.match(source, /router\.refresh\(\)/);
  }
  assert.match(panel, /decide\(request\.id, "decline"\)/);
  assert.match(panel, /Accept and set fee/);
  assert.match(panel, /decision === "accept" && !amount/);
  assert.match(panel, /!completedRequestIds\.current\.has\(request\.id\)/);
  const guest = read('src/components/captain/FixtureGuestApprovals.tsx');
  assert.match(guest, /canManage && data\?\.canManage && data\.fixture\.editable/);
  assert.doesNotMatch(guest, />Guest approvals<|Approval itself does not select a player|the captain can set their fee/);
  const route = read('src/app/api/captain/team/[teamid]/temporary-player-requests/route.ts');
  assert.match(route, /requireCaptain\(teamid\)/);
  assert.match(route, /fixtureBelongsToTeam\(fixtureId, teamid\)/);
  assert.match(route, /declineTemporaryPlayerRequest\(/);
});
