const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadSource } = require('../admin-activity/load.cjs');
const pagePath = 'src/app/(admin)/admin/pwa/page.tsx';
const pickerPath = 'src/components/admin/pwa/PwaViewerPicker.tsx';
const panelPath = 'src/components/admin/PwaDiagnosticsPanel.tsx';

function harness(deny = false) {
  const calls = [];
  function Panel() { return null; }
  const team = (id, mode, members = []) => ({ id, name: id, teamMode: mode, logoUrl: null, league: { name: 'Example league', season: 'Test season' }, members });
  const member = (id, name) => ({ id, role: 'PLAYER', user: { name, email: 'sample@example.invalid' } });
  const prisma = {
    team: { findMany: async () => { calls.push('teams'); return [team('standard', 'STANDARD', [member('member-z', 'Zoe Example'), member('member-a', 'Alex Example')]), team('managed', 'MANAGED', [member('member-m', 'Morgan Example')]), team('empty', 'STANDARD')]; } },
    user: { findMany: async args => { calls.push(args.where.role); return [{ id: 'referee', name: 'Stefan Example', email: 'referee@example.invalid' }]; } },
  };
  const page = loadSource(pagePath, {
    '@/lib/prisma': { prisma },
    '@/lib/requireAdmin': { requireAdmin: async () => { calls.push('admin'); if (deny) throw new Error('Denied'); } },
    '@/components/admin/PwaDiagnosticsPanel': Panel,
    'next/link': function Link() { return null; },
  }).default;
  return { page, calls, Panel };
}
function findElement(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type); if (found) return found;
  }
  return null;
}

test('desktop options are authorised before any record lookup', async () => {
  const h = harness(true);
  await assert.rejects(h.page(), /Denied/);
  assert.deepEqual(h.calls, ['admin']);
});

test('restored page passes exact team/member/referee identities and preserves managed player views', async () => {
  const h = harness();
  const result = await h.page();
  const component = findElement(result, h.Panel);
  assert.ok(component, 'the owning diagnostics panel receives the server data');
  const data = component.props.viewerData;
  assert.deepEqual(data.captainTeams.map(t => t.id), ['standard', 'empty']);
  assert.deepEqual(data.playerTeams.map(t => t.id), ['standard', 'managed']);
  assert.deepEqual(data.playerTeams[0].players.map(p => p.membershipId), ['member-a', 'member-z']);
  assert.deepEqual(data.referees.map(r => r.id), ['referee']);
  assert.equal(h.calls[0], 'admin');
  assert.ok(h.calls.includes('REFEREE'));
});

test('viewer remains connected to the existing iframe, custom controls and persisted selection', () => {
  const picker = fs.readFileSync(pickerPath, 'utf8');
  const panel = fs.readFileSync(panelPath, 'utf8');
  assert.match(panel, /<PwaViewerPicker data=\{viewerData\} onPreview=\{loadPreviewPath\}/);
  assert.match(panel, /src=\{previewPath\}/);
  assert.match(panel, /sixfl-admin-pwa-preview-path-v1/);
  assert.match(picker, /sixfl-admin-pwa-viewer-selection-v1/);
  assert.match(picker, /storedMembership\?\.membershipId/);
  assert.match(picker, /\/admin\/teams\/\$\{captainTeamId\}\/captain-preview/);
  assert.match(picker, /previewMembershipId=\$\{encodeURIComponent\(playerMembershipId\)\}/);
  assert.match(picker, /\/admin\/referees\/\$\{refereeId\}\/referee-preview/);
  assert.doesNotMatch(picker + panel, /<select\b|MutationObserver|document\.querySelector/);
  assert.match(panel, /url\.origin !== window\.location\.origin/);
});
