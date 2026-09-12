const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    './FixtureVeoConfirmationForm': {StopFutureVeoForm: () => React.createElement('span',null,'Turn off future Veo Priority')},
  }).default;
  return renderToStaticMarkup(await Card({ teamId: 'team', leagueId: 'league' }));
}
test('real captain card is absent when the shared service says the league is off or team ineligible', async () => {
  assert.equal(await renderCard(null), '');
});
test('captain overview directs to the shared fixture options, including in a safe preview', async () => {
  for(const access of [normalAccess,...previewAccess]) {
    const html=await renderCard({priority:false,request:null},access);
    for(const text of ['Open fixtures and choose Veo','Just this match','This and future matches','£5 extra for the whole team','YouTube'])assert.ok(html.includes(text),text);
    assert.doesNotMatch(html, /Request Veo Priority<|<form/);
  }
});
test('legacy pending request and approved preference remain visible', async () => {
  assert.ok((await renderCard({priority:false,request:{status:'PENDING'}})).includes('awaiting SIXFL review'));
  assert.ok((await renderCard({priority:true,request:{status:'APPROVED'}})).includes('saved preference'));
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
