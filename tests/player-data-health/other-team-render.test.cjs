const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const esbuild = require('esbuild');

let Component;
async function render(matches) {
  if (!Component) {
    const result = await esbuild.build({
      entryPoints: ['src/components/admin/players/PlayerDataHealthReview.tsx'],
      bundle: true, platform: 'node', packages: 'external', format: 'cjs', jsx: 'automatic', write: false,
      plugins: [{ name: 'inert-server-actions', setup(build) {
        build.onLoad({ filter: /[\\/]data-health[\\/]actions\.ts$/ }, () => ({ contents: 'export async function confirmIdentityAction() {}\nexport async function markDifferentPeopleAction() {}', loader: 'ts' }));
        build.onLoad({ filter: /HealthSubmitButton\.tsx$/ }, () => ({ contents: 'export default function Button({children}) { return <button type="submit">{children}</button>; }', loader: 'tsx' }));
      }}],
    });
    const file = path.resolve('.data-health-other-team-render.cjs');
    fs.writeFileSync(file, result.outputFiles[0].text);
    Component = require(file).default;
  }
  return renderToStaticMarkup(React.createElement(Component, { matches }));
}
const base = {
  record: { kind: 'PROSPECT', id: 'old-prospect', name: 'Alex Example', email: 'old@example.invalid', phone: '07700900999', status: 'CONTACTED', teamId: 'old-team', teamName: 'Old enquiry club', profileId: null, publicCode: null },
  candidates: [{ userId: 'current-user', name: 'Alex Example', email: 'current@example.invalid', phones: ['+447700900999'], teams: [{ id: 'first', name: 'First current club' }, { id: 'second', name: 'Second current club' }], evidence: ['Same name', 'Same normalised mobile'], definite: false }],
  safe: false, reason: 'Different-team enquiry retained for review', fingerprint: 'test-fingerprint',
};
test('native closure option is explicit, team-bound, unchecked and preserves both visible squads', async () => {
  const html = await render([base]);
  const checkbox = html.match(/<input[^>]*name="closeOtherTeamEnquiryId"[^>]*>/)?.[0];
  assert.ok(checkbox); assert.match(checkbox, /type="checkbox"/); assert.match(checkbox, /value="old-team"/);
  assert.doesNotMatch(checkbox, /checked/);
  assert.match(html, /Keep registered with: First current club, Second current club/);
  assert.match(html, /Close this other-team enquiry as a duplicate/);
  assert.match(html, /Do not register this player with Old enquiry club/);
  assert.match(html, /pattern="CONFIRM"/);
});
test('review cards allow an explicit audited different-person decision without changing either record', async () => {
  const html = await render([base]);
  assert.match(html, /These are different people/);
  assert.match(html, /name="differentReason"/);
  assert.match(html, /name="differentConfirmed"/);
  assert.match(html, /value="current-user"/);
  assert.match(html, /keeps both records exactly as they are/);
});
test('closure option is not offered for a current team, an unassigned enquiry or a stopped prospect', async () => {
  for (const record of [ { ...base.record, teamId: 'first' }, { ...base.record, teamId: null }, { ...base.record, status: 'DECLINED' } ]) {
    assert.doesNotMatch(await render([{ ...base, record }]), /name="closeOtherTeamEnquiryId"/);
  }
});
test('server actions refresh review views without moving a squad', () => {
  const source = fs.readFileSync('src/app/(admin)/admin/players/data-health/actions.ts', 'utf8');
  assert.match(source, /const closeOtherTeamEnquiryId = text\("closeOtherTeamEnquiryId"\) \|\| undefined/);
  assert.match(source, /reason: text\("reason"\), closeOtherTeamEnquiryId/);
  assert.match(source, /markPlayerDataHealthDifferentPeople/);
  assert.match(source, /differentConfirmed/);
  assert.match(source, /refresh\(result\.enquiryTeamId\)/);
  assert.doesNotMatch(source, /teamMember\.(?:create|delete|update)/);
});
