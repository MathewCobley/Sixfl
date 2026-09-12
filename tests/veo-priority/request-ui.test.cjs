const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const cardPath = 'src/components/captain/CaptainVeoPriorityCard.tsx';
const formPath = 'src/components/captain/VeoPriorityRequestForm.tsx';
const actionPath = 'src/app/captain/team/[teamid]/veo-priority/actions.ts';
const reviewPath = 'src/app/(admin)/admin/leagues/[id]/veo-priority/request-actions.ts';
class VeoRequestError extends Error {}
function load(file, mocks) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', js)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react' || key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unexpected request UI dependency: ${key}`);
  }, mod, mod.exports);
  return mod.exports;
}
// These are the actual requireCaptain access modes, not invented role labels.
const normalAccess = { accessMode: 'captain', isAdmin: false, isCaptain: true, user: { id: 'captain' } };
const previewAccess = [
  { accessMode: 'captain', isAdmin: true, isCaptain: false, user: { id: 'admin' } },
  { accessMode: 'captain-preview', isAdmin: false, isCaptain: true, user: { id: 'admin' } },
  { accessMode: 'captain', isAdmin: false, isCaptain: false, user: null },
  { accessMode: 'captain', isAdmin: false, isCaptain: false, user: { id: 'non-captain' } },
];
async function renderCard(offer, access = normalAccess) {
  const form = load(formPath, { '@/app/captain/team/[teamid]/veo-priority/actions': {
    requestVeoPriorityAction: async () => ({ status: 'pending', message: 'Requested' }),
  } }).default;
  const Card = load(cardPath, {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/lib/requireCaptain': { requireCaptain: async () => access },
    '@/lib/veo/priority-requests': { readVeoOffer: async () => offer, VEO_REQUEST_TERMS: 'veo-priority-v1' },
    './VeoPriorityRequestForm': form,
  }).default;
  return renderToStaticMarkup(await Card({ teamId: 'team', leagueId: 'league' }));
}
function customerMarkup(html) {
  const start = html.indexOf('<section');
  return html.slice(start, html.indexOf('</section>', start) + '</section>'.length);
}
function visibleCopy(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function saveArtifact(name, html) {
  fs.mkdirSync('artifacts/veo', { recursive: true });
  fs.writeFileSync(`artifacts/veo/${name}.html`, html);
}
test('real captain card is absent when the shared service says the league is off or team ineligible', async () => {
  assert.equal(await renderCard(null), '');
  for (const access of previewAccess) assert.equal(await renderCard(null, access), '');
});
test('eligible captain sees a live form, plain pricing, activation steps and public-filming disclosure', async () => {
  const html = await renderCard({ priority: false, request: null });
  for (const word of ['Get more of your matches', 'How to switch it on', 'Tick the agreement', 'Request Veo Priority', 'if approved', '£5 extra for the whole team', 'scheduled on the Veo pitch', 'usual match fee', 'YouTube', 'not guaranteed', 'name="agreed"', 'required', 'name="termsVersion"']) assert.ok(html.includes(word), word);
  assert.match(html, /<form\b/);
  assert.doesNotMatch(html.match(/<input\b[^>]*name="agreed"[^>]*>/)[0], /disabled/);
  assert.doesNotMatch(html.match(/<button\b[^>]*>/)[0], /disabled/);
  assert.ok(!html.includes('name="actorId"'));
  assert.ok(!html.includes('Veo preview notice'));
  assert.doesNotMatch(customerMarkup(html), /read-only preview|fixture publications|No Veo allocation|supplement/);
  saveArtifact('captain-promo', html);
});
test('pending, approved and declined cards persist without another sign-up button in live or preview', async () => {
  for (const [offer, expected] of [
    [{ priority: false, request: { status: 'PENDING' } }, 'awaiting SIXFL approval'],
    [{ priority: true, request: { status: 'APPROVED' } }, 'Veo Priority is ON'],
    [{ priority: false, request: { status: 'DECLINED' } }, 'not approved'],
  ]) {
    for (const access of [normalAccess, ...previewAccess]) {
      const html = await renderCard(offer, access);
      assert.ok(html.includes(expected)); assert.doesNotMatch(customerMarkup(html), /<button|<form|name="agreed"/);
    }
  }
});
test('admin and captain-only previews show identical customer copy and disabled controls, never a live form', async () => {
  const live = customerMarkup(await renderCard({ priority: false, request: null }));
  for (const [index, access] of previewAccess.entries()) {
    const html = await renderCard({ priority: false, request: null }, access);
    const card = customerMarkup(html);
    assert.ok(html.includes('Veo preview notice'));
    assert.ok(html.indexOf('</aside>') < html.indexOf('<section'), 'Preview notice stays outside customer card');
    assert.equal(visibleCopy(card), visibleCopy(live));
    assert.match(card, /<input\b[^>]*name="agreed"[^>]*disabled=""/);
    assert.match(card, /<button\b[^>]*type="button"[^>]*disabled=""/);
    assert.ok(card.includes('Request Veo Priority'));
    assert.doesNotMatch(html, /<form|\$ACTION_|name="termsVersion"/);
    assert.doesNotMatch(card, /Preview only|read-only preview/);
    saveArtifact(index === 0 ? 'admin-preview' : index === 1 ? 'captain-preview' : `fallback-preview-${index}`, html);
  }
});
test('preview is fail-closed by default and does not even bind the request server action', () => {
  const forbiddenAction = new Proxy(() => { throw new Error('Preview invoked action'); }, {
    get() { throw new Error('Preview bound action'); },
  });
  const Form = load(formPath, { '@/app/captain/team/[teamid]/veo-priority/actions': { requestVeoPriorityAction: forbiddenAction } }).default;
  for (const preview of [undefined, true]) {
    const html = renderToStaticMarkup(React.createElement(Form, { teamId: 'team', leagueId: 'league', termsVersion: 'veo-priority-v1', preview }));
    assert.ok(html.includes('Request Veo Priority'));
    assert.match(html, /disabled=""/);
    assert.doesNotMatch(html, /<form|\$ACTION_|name="termsVersion"/);
  }
});
test('native action refuses every preview mode and binds the real actor and exact team server-side', async () => {
  let access = previewAccess[0];
  const writes = [], refreshed = [];
  const action = load(actionPath, {
    'next/cache': { revalidatePath: (...args) => refreshed.push(args) },
    '@/lib/requireCaptain': { requireCaptain: async () => access },
    '@/lib/veo/priority-requests': { VeoRequestError, requestVeoPriority: async input => { writes.push(input); return 'PENDING'; } },
  }).requestVeoPriorityAction;
  const form = new FormData(); form.set('agreed', 'on'); form.set('termsVersion', 'veo-priority-v1'); form.set('actorId', 'forged-admin');
  for (const preview of previewAccess) {
    access = preview;
    assert.equal((await action('team', 'league', {}, form)).status, 'error');
    assert.equal(writes.length, 0);
  }
  access = normalAccess;
  assert.equal((await action('team', 'league', {}, form)).status, 'pending');
  assert.deepEqual(writes[0], { teamId: 'team', leagueId: 'league', actorId: 'captain', agreed: true, termsVersion: 'veo-priority-v1' });
  assert.ok(refreshed.some(x => x[0] === '/captain/team/team'));
  assert.ok(refreshed.some(x => x[0] === '/admin/leagues/league' && x[1] === 'layout'));
});
test('native admin action rejects anonymous development use and validates a decision before calling the service', async () => {
  let user = null; const writes = [];
  const action = load(reviewPath, {
    'next/cache': { revalidatePath: () => {} }, '@/lib/requireAdmin': { requireAdmin: async () => ({ user }) },
    '@/lib/veo/priority-requests': { VeoRequestError, reviewVeoPriorityRequest: async input => { writes.push(input); return 'team'; } },
  }).reviewVeoPriorityAction;
  const form = new FormData(); form.set('decision', 'APPROVED');
  assert.equal((await action('league', 'request', {}, form)).error, true); assert.equal(writes.length, 0);
  user = { id: 'real-admin' };
  form.set('decision', 'PAY'); assert.equal((await action('league', 'request', {}, form)).error, true);
  form.set('decision', 'DECLINED'); assert.equal((await action('league', 'request', {}, form)).done, true);
  assert.deepEqual(writes[0], { leagueId: 'league', requestId: 'request', actorId: 'real-admin', decision: 'DECLINED' });
});
test('owning sources retain the promo and admin queue after preparation; no new browser DOM bridges or sending paths', () => {
  const overview = fs.readFileSync('src/app/captain/team/[teamid]/page.tsx', 'utf8');
  assert.equal((overview.match(/<CaptainVeoPriorityCard /g) || []).length, 1);
  assert.ok(overview.includes('leagueId={currentLeagueId}'));
  const admin = fs.readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/actions.ts', 'utf8');
  assert.ok(admin.includes('approvePendingVeoRequests(tx, leagueId, teamId, user.id)'));
  for (const file of [cardPath, formPath, actionPath, reviewPath, 'src/lib/veo/priority-requests.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /MutationObserver|document\.querySelector|sendEmail|queueDirectNotification|stripe\./);
  }
});
test('repository-wide source inventory has no stale preview replacement or duplicate Veo request field copy', () => {
  const refs = [], stale = [], fieldOwners = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/CaptainVeoPriorityCard|VeoPriorityRequestForm|requestVeoPriorityAction/.test(text)) refs.push(file);
      if (text.includes('This is a read-only preview. The captain can request Priority here') || text.includes('£5 when allocated')) stale.push(file);
      if (text.includes("I agree to an extra £5 on our team's match fee")) fieldOwners.push(file);
    }
  }
  visit('src'); visit('scripts');
  assert.deepEqual(stale, []);
  assert.deepEqual(fieldOwners, [formPath]);
  assert.ok(refs.includes(cardPath) && refs.includes(formPath) && refs.includes(actionPath));
  fs.mkdirSync('artifacts/veo', { recursive: true });
  fs.writeFileSync('artifacts/veo/request-source-inventory.json', JSON.stringify({ refs, stale, fieldOwners }, null, 2));
});
