const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', compiled.outputText)(id => {
    if (Object.hasOwn(mocks, id)) return { __esModule: true, ...mocks[id] };
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    throw Error(`Unmocked chat dependency: ${id}`);
  }, mod, mod.exports, () => { throw Error('Network disabled'); });
  return mod.exports;
}

async function renderChat(access, mode = 'app', deny = false) {
  const calls = [];
  const Page = load('src/app/captain/team/[teamid]/chat/page.tsx', {
    '@/lib/requireCaptain': { requireCaptain: async id => {
      calls.push(id);
      if (deny) throw Error('NOT_AUTHORISED');
      return access;
    } },
    'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
    '@/components/captain/CaptainPwaModeOnly': { default: props => props.mode === mode ? props.children : null },
    '@/components/messaging/PortalChat': { default: props => React.createElement('div', {
      'data-team': props.teamId, 'data-chat': true, 'data-app': Boolean(props.playerApp),
      'data-admin-test': Boolean(props.adminTestMode), 'data-simulate': Boolean(props.simulateTestMode),
    }) },
  }).default;
  const element = await Page({ params: Promise.resolve({ teamid: 'demo' }) });
  return { html: renderToStaticMarkup(element), calls };
}

for (const mode of ['app', 'web']) test(`real captain can open the shared Chat in ${mode} mode without admin testing`, async () => {
  const { html, calls } = await renderChat({ isCaptain: true, isAdmin: false, accessMode: 'captain' }, mode);
  assert.deepEqual(calls, ['demo']);
  assert.equal((html.match(/data-chat="true"/g) || []).length, 1);
  assert.match(html, /data-team="demo"/);
  assert.match(html, /data-admin-test="false"/);
  assert.match(html, /data-simulate="false"/);
  assert.ok(html.includes(`data-app="${mode === 'app'}"`));
});
test('captain-only preview never opts into admin testing or simulated sending', async () => {
  const { html } = await renderChat({ isCaptain: true, isAdmin: false, accessMode: 'captain-preview' });
  assert.match(html, /data-admin-test="false"/);
  assert.match(html, /data-simulate="false"/);
});
test('full administrator retains the existing explicit admin testing mode', async () => {
  const { html } = await renderChat({ isCaptain: false, isAdmin: true });
  assert.match(html, /data-admin-test="true"/);
});
test('denied team access and permissive development fallbacks never render Chat', async () => {
  await assert.rejects(renderChat({}, 'app', true), /NOT_AUTHORISED/);
  await assert.rejects(renderChat({ isCaptain: false, isAdmin: false }), /NOT_FOUND/);
});

function unreadEndpoint(options = {}) {
  const calls = [];
  const defaultUser = { id: 'signed-in-captain', role: 'USER', teamMembers: [
    { id: 'captain-member', userId: 'signed-in-captain', role: 'CAPTAIN' },
  ] };
  const user = Object.hasOwn(options, 'user') ? options.user : defaultUser;
  const GET = load('src/app/api/player/team/[teamid]/chat-unread/route.ts', {
    '@prisma/client': { UserRole: { ADMIN: 'ADMIN' } },
    'next-auth': { getServerSession: async () => options.signedOut ? null : { user: { email: 'Captain@Example.invalid' } } },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/auth': { authOptions: {} },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async query => { calls.push(['user', query]); return user; } },
      teamMember: { findFirst: async query => { calls.push(['preview', query]); return options.preview || null; } },
    } },
    '@/lib/portal-messaging': { getPortalChatUnreadCount: async query => { calls.push(['unread', query]); return 7; } },
  }).GET;
  return { calls, run: (query = '') => GET(new Request(`https://example.invalid/api/player/team/demo/chat-unread${query}`), {
    params: Promise.resolve({ teamid: 'demo' }),
  }) };
}
test('shared unread endpoint counts the actual captain and team, not the legacy inbox', async () => {
  const h = unreadEndpoint();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { unreadCount: 7 });
  assert.deepEqual(h.calls.find(c => c[0] === 'unread')[1], { teamId: 'demo', userId: 'signed-in-captain', role: 'CAPTAIN' });
  const query = h.calls.find(c => c[0] === 'user')[1];
  assert.deepEqual(query.where, { email: 'captain@example.invalid' });
  assert.deepEqual(query.select.teamMembers.where, { teamId: 'demo' });
});
test('query parameters cannot make a captain count another member or admin test account', async () => {
  const h = unreadEndpoint();
  await h.run('?previewMembershipId=somebody-else&adminTest=1&simulate=1');
  assert.equal(h.calls.filter(c => c[0] === 'preview').length, 0);
  assert.equal(h.calls.find(c => c[0] === 'unread')[1].userId, 'signed-in-captain');
});
test('signed-out and unknown users do not query unread messages', async () => {
  for (const options of [{ signedOut: true }, { user: null }]) {
    const h = unreadEndpoint(options);
    assert.equal((await h.run()).status, 401);
    assert.equal(h.calls.filter(c => c[0] === 'unread').length, 0);
  }
});
test('other-team members and administrators without a membership have no invented captain badge', async () => {
  for (const role of ['USER', 'ADMIN']) {
    const h = unreadEndpoint({ user: { id: 'outsider', role, teamMembers: [] } });
    assert.deepEqual(await (await h.run()).json(), { unreadCount: 0 });
    assert.equal(h.calls.filter(c => c[0] === 'unread').length, 0);
  }
});
test('badge polling reads only; conversation creation and read receipts are not side effects', () => {
  const route = fs.readFileSync('src/app/api/player/team/[teamid]/chat-unread/route.ts', 'utf8');
  assert.doesNotMatch(route, /\.create\(|\.update\(|\.upsert\(|ensureTeamPortalConversation|queuePushNotifications/);
  const nav = fs.readFileSync('src/components/captain/CaptainPwaBottomNav.tsx', 'utf8');
  assert.doesNotMatch(nav, /querySelector|MutationObserver|innerHTML|method:\s*["']POST/);
  assert.match(nav, /unreadCount: unreadChatCount/);
  assert.doesNotMatch(nav, /unreadCount: unreadMessageCount/);
});


test('unread total ignores archived and stale Regulars chats so badge matches the visible chat list', async () => {
  const unreadByConversation = new Map([
    ['team', 2],
    ['visible-group', 1],
    ['archived-group', 4],
    ['stale-regulars', 5],
  ]);
  const conversations = [
    {
      id: 'team',
      type: 'TEAM',
      conversationKey: 'TEAM:demo',
      latestMessageAt: new Date('2026-09-26T12:00:00Z'),
      members: [],
      reads: [{ lastReadAt: new Date('2026-09-26T11:00:00Z'), archivedAt: null }],
    },
    {
      id: 'visible-group',
      type: 'SELECTED_GROUP',
      conversationKey: 'SELECTED_GROUP:demo:u1:u2',
      latestMessageAt: new Date('2026-09-26T12:05:00Z'),
      members: [{ userId: 'u1' }, { userId: 'u2' }],
      reads: [{ lastReadAt: new Date('2026-09-26T11:00:00Z'), archivedAt: null }],
    },
    {
      id: 'archived-group',
      type: 'SELECTED_GROUP',
      conversationKey: 'SELECTED_GROUP:demo:u1:u3',
      latestMessageAt: new Date('2026-09-26T10:00:00Z'),
      members: [{ userId: 'u1' }, { userId: 'u3' }],
      reads: [{ lastReadAt: new Date('2026-09-26T09:00:00Z'), archivedAt: new Date('2026-09-26T10:30:00Z') }],
    },
    {
      id: 'stale-regulars',
      type: 'REGULARS',
      conversationKey: 'REGULARS:demo:u1',
      latestMessageAt: new Date('2026-09-26T12:10:00Z'),
      members: [{ userId: 'u1' }],
      reads: [{ lastReadAt: new Date('2026-09-26T11:00:00Z'), archivedAt: null }],
    },
  ];

  const helper = load('src/lib/portal-messaging.ts', {
    '@prisma/client': {
      PortalConversationType: {
        TEAM: 'TEAM',
        SIXFL: 'SIXFL',
        CAPTAIN_PLAYER: 'CAPTAIN_PLAYER',
        CAPTAIN_CAPTAIN: 'CAPTAIN_CAPTAIN',
        REGULARS: 'REGULARS',
        SELECTED_GROUP: 'SELECTED_GROUP',
      },
      TeamRole: { CAPTAIN: 'CAPTAIN' },
    },
    '@/lib/prisma': {
      prisma: {
        portalConversation: { findMany: async () => conversations },
        teamMember: {
          findMany: async () => [
            { userId: 'u1', isRegular: true, role: 'PLAYER' },
            { userId: 'u2', isRegular: true, role: 'PLAYER' },
            { userId: 'captain', isRegular: false, role: 'CAPTAIN' },
          ],
        },
        portalMessage: {
          count: async ({ where }) => unreadByConversation.get(where.conversationId) ?? 0,
        },
      },
    },
  });

  assert.equal(
    await helper.getPortalChatUnreadCount({
      teamId: 'demo',
      userId: 'u1',
      role: 'PLAYER',
    }),
    3,
  );
});

test('chat makes unread locations explicit and immediately synchronises the app badge', () => {
  const chat = fs.readFileSync('src/components/messaging/PortalChat.tsx', 'utf8');
  const playerNav = fs.readFileSync('src/components/player/PlayerTeamNav.tsx', 'utf8');
  const captainNav = fs.readFileSync('src/components/captain/CaptainPwaBottomNav.tsx', 'utf8');
  const route = fs.readFileSync('src/app/api/portal-chat/team/[teamid]/route.ts', 'utf8');

  assert.match(route, /unreadCountBeforeOpen/);
  assert.match(route, /firstUnreadMessageId/);
  assert.match(chat, /aria-label="Unread chats"/);
  assert.match(chat, /\{item\.unreadCount\} unread/);
  assert.match(chat, /New messages start here/);
  assert.match(chat, /new message\{openedUnread\.count === 1 \? "" : "s"\}/);
  assert.match(chat, /sixfl:chat-unread-count/);
  assert.match(playerNav, /sixfl:chat-unread-count/);
  assert.match(captainNav, /sixfl:chat-unread-count/);
});
