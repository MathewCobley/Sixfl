const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { members } = require('./squad-fixture.cjs');
const file = 'src/components/captain/CaptainAppSquad.tsx';
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
}, reportDiagnostics: true });
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)((id) => {
  if (id.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  if (['react', 'react/jsx-runtime', 'react-dom'].includes(id)) return require(id);
  throw Error(`Unmocked dependency: ${id}`);
}, mod, mod.exports);
const { default: Squad, filterSquadMembers } = mod.exports;
let writes = 0;
const inertAction = async () => { writes++; };
const props = { teamId: 'demo', members, canAddPlayers: true, savedMessage: null, errorMessage: null,
  addPlayerAction: inertAction, sendLoginAction: inertAction, setRegularAction: inertAction };
const render = (extra = {}) => renderToStaticMarkup(React.createElement(Squad, { ...props, ...extra }));

test('all squad roles remain present; filters use membership flags, not invented status', () => {
  assert.deepEqual(filterSquadMembers(members, '', 'all'), members);
  assert.equal(filterSquadMembers(members, '', 'regulars').length, 3);
  assert.equal(filterSquadMembers(members, '', 'organisers').length, 2);
  assert.equal(filterSquadMembers(members, '  MORGAN ', 'regulars')[0].id, 'member-1');
  assert.equal(filterSquadMembers(members, 'Morgan', 'organisers')[0].id, 'member-1');
  assert.equal(filterSquadMembers(members, 'Parker', 'regulars').length, 0);
  assert.equal(filterSquadMembers(members, '#7', 'all')[0].id, 'member-7');
  assert.equal(filterSquadMembers(members, 'PLAYER2@EXAMPLE.INVALID', 'all')[0].id, 'member-2');
  assert.equal(filterSquadMembers(members, 'not-a-player', 'all').length, 0);
});

test('real screen renders players, retained details and authorised action fields without writes', () => {
  const html = render();
  assert.match(html, /data-captain-native-squad/);
  assert.match(html, /aria-label="Squad members"/);
  assert.match(html, /aria-label="Search squad"|Search squad/);
  for (const member of members) assert.ok(html.includes(member.name));
  assert.match(html, /captain-squad\/member-1\/edit/);
  assert.match(html, /name="teamid" value="demo"/);
  assert.match(html, /name="membershipId" value="member-1"/);
  assert.match(html, /name="returnTo" value="captain-squad"/);
  assert.match(html, /aria-label="Add a player"/);
  assert.match(html, /name="email" type="email" required=""/);
  assert.match(html, /Defender/);
  assert.match(html, /Usually available on Tuesdays/);
  assert.match(html, /Email needed/);
  assert.doesNotMatch(html, /Players currently attached|Captain and support roles|MetricCard/);
  assert.doesNotMatch(html, /<select[\s>]/);
  assert.equal(writes, 0);
});

test('managed teams cannot open an add-player form; existing edit and contact remain', () => {
  const html = render({ canAddPlayers: false });
  assert.doesNotMatch(html, /aria-label="Add a player"|name="displayName"/);
  assert.match(html, /Contact SIXFL/);
  assert.match(html, /captain-squad\/member-1\/edit/);
});

test('empty and feedback states are explicit and output is escaped', () => {
  assert.match(render({ members: [] }), /Your squad is empty/);
  assert.match(render({ savedMessage: 'Saved.' }), /role="status" class="success">Saved\./);
  const html = render({ errorMessage: '<script>bad</script>' });
  assert.match(html, /role="alert"/);
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
});

test('native mode is wired at the owning server page with shared data and existing guarded actions', () => {
  const route = fs.readFileSync('src/app/captain/team/[teamid]/captain-squad/page.tsx', 'utf8');
  const app = route.match(/<CaptainPwaModeOnly mode="app">([\s\S]*?)<\/CaptainPwaModeOnly>/)?.[1];
  const web = route.match(/<CaptainPwaModeOnly mode="web">([\s\S]*?)<\/CaptainPwaModeOnly>/)?.[1];
  assert.ok(app && web, 'actual app and website modes, not a viewport-only restyle');
  assert.match(app, /<CaptainAppSquad/);
  assert.match(app, /members=\{appMembers\}/);
  assert.match(app, /canAddPlayers=\{canCaptainAddPlayers\}/);
  assert.match(app, /addPlayerAction=\{addCaptainPlayerAction\}/);
  assert.match(app, /sendLoginAction=\{sendCaptainPlayerDashboardLoginEmailAction\}/);
  assert.match(app, /setRegularAction=\{setSquadMemberRegularAction\}/);
  assert.doesNotMatch(app, /MetricCard|Your squad/);
  assert.match(web, /MetricCard/);
  assert.match(web, /form action=\{addCaptainPlayerAction\}/);
  assert.match(route, /const appMembers = team\.members\.map/);
  for (const name of ['addCaptainPlayerAction', 'sendCaptainPlayerDashboardLoginEmailAction', 'CaptainSquadViewPage']) {
    const start = route.indexOf(`function ${name}(`);
    const end = route.indexOf('\n}', start);
    assert.ok(start >= 0);
    assert.match(route.slice(start, end), /await requireCaptain\(teamid\)/);
  }
  assert.match(route, /team\.teamMode === "MANAGED"/);
  assert.match(route, /where: \{ id: membershipId, teamId: teamid \}/);
});

test('native screen does not query data, scrape pages or introduce private admin actions', () => {
  assert.doesNotMatch(source, /MutationObserver|querySelector|createTreeWalker|innerHTML|fetch\(|\/api\/admin\//);
  const css = fs.readFileSync('src/components/captain/CaptainAppSquad.module.css', 'utf8');
  assert.match(css, /\.screen \[hidden\].*display: none/);
  assert.doesNotMatch(css, /body:has|:global/);
});
