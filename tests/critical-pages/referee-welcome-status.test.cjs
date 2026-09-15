const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the owning server page with isolated, read-only I/O. No database,
// provider, sign-in link or customer notification is used by these tests.
const sourcePath = 'src/app/(admin)/admin/referees/page.tsx';
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: sourcePath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const referee = {
  id: 'test-referee', name: 'Test Referee', email: 'referee@example.invalid',
  createdFromLeadId: null, refereedFixtures: [],
};
const loginAt = new Date('2026-09-02T10:30:00Z');
const cancelledAt = new Date('2026-09-12T15:45:00Z');
const cancelled = {
  refereeId: referee.id, status: 'CANCELLED', at: cancelledAt,
  failureReason: 'Superseded by a newer invitation.',
};

async function renderPage(options = {}) {
  const welcome = Object.hasOwn(options, 'welcome') ? options.welcome : cancelled;
  const lastLoginAt = Object.hasOwn(options, 'lastLoginAt') ? options.lastLoginAt : loginAt;
  const referees = options.empty ? [] : [referee];
  const queries = [];
  let authorised = false;
  let userQuery;
  const mocks = {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@prisma/client': {
      UserRole: { REFEREE: 'REFEREE' },
      Prisma: {
        sql: (strings, ...values) => ({ text: strings.join('?'), values }),
        join: values => values,
      },
    },
    '@/lib/requireAdmin': {
      requireAdmin: async () => {
        if (options.denyAdmin) throw new Error('Admin required');
        authorised = true;
      },
    },
    '@/lib/prisma': {
      prisma: {
        user: {
          findMany: async query => {
            assert.ok(authorised, 'Authorisation must precede every data read');
            userQuery = query;
            return referees;
          },
        },
        $queryRaw: async query => {
          assert.ok(authorised);
          queries.push(query);
          if (query.text.includes('FROM "NotificationDispatch"')) return welcome ? [welcome] : [];
          if (query.text.includes('FROM "User"')) {
            return [{ userId: referee.id, lastLoginAt, activeSessionCount: options.activeSessionCount ?? 1 }];
          }
          throw new Error(`Unexpected read: ${query.text}`);
        },
      },
    },
    '@/lib/referees/profile': {
      formatMoney: value => value == null ? 'Not set' : `£${(value / 100).toFixed(2)}`,
      getRefereeProfilesByUserIds: async ids => {
        assert.ok(authorised);
        return new Map(ids.map(id => [id, { isActive: options.isActive ?? true, standardNightFeePence: 4500 }]));
      },
    },
    './actions': {
      createRefereeAction: async () => { throw new Error('Test must not create referees or send invitations'); },
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unexpected referee page dependency: ${key}`);
  }, mod, mod.exports);
  const element = await mod.exports.default({ searchParams: Promise.resolve(options.searchParams ?? {}) });
  return { html: renderToStaticMarkup(element), queries, userQuery };
}

function section(html, name) {
  const match = html.match(new RegExp(`<section\\b[^>]*aria-label="${name}"[^>]*>[\\s\\S]*?</section>`));
  assert.ok(match, `${name} is a separate, labelled section`);
  return match[0];
}

test('cancelled welcome never overrides a successful sign-in; dashboard comes first', async () => {
  const { html } = await renderPage();
  const dashboard = section(html, 'Dashboard access');
  const email = section(html, 'Welcome email');
  assert.match(dashboard, /Already accessed —/);
  assert.match(dashboard, /02 Sept/);
  assert.match(dashboard, /11:30/); // Europe/London, not the server timezone.
  assert.match(dashboard, /active session/);
  assert.match(dashboard, /bg-emerald-/);
  assert.match(email, /Not sent \(cancelled\) —/);
  assert.match(email, /12 Sept/);
  assert.match(email, /16:45/);
  assert.match(email, /Superseded by a newer invitation\./);
  assert.match(email, /This email status does not change dashboard access\./);
  assert.doesNotMatch(email, /(?:bg|text|border)-red-/);
  assert.ok(html.indexOf(dashboard) < html.indexOf(email));
  assert.doesNotMatch(html, /Welcome cancelled|Dashboard not opened yet/);
});

for (const failureReason of [null, '', '   ']) {
  test(`missing cancellation reason ${JSON.stringify(failureReason)} is explicit, never inferred from sign-in`, async () => {
    const { html } = await renderPage({ welcome: { ...cancelled, failureReason } });
    const email = section(html, 'Welcome email');
    assert.match(email, /No cancellation reason recorded\./);
    assert.doesNotMatch(email, /already signed in|because.*accessed/i);
  });
}

test('recorded reason is trimmed and escaped as text, not rendered as HTML', async () => {
  const { html } = await renderPage({ welcome: { ...cancelled, failureReason: '  <script>bad()</script> & reason  ' } });
  const email = section(html, 'Welcome email');
  assert.match(email, /&lt;script&gt;bad\(\)&lt;\/script&gt; &amp; reason/);
  assert.doesNotMatch(email, /<script>/);
});

test('no recorded sign-in is not shown as dashboard access even if an email was sent', async () => {
  for (const welcome of [cancelled, { ...cancelled, status: 'SENT' }, null]) {
    const { html } = await renderPage({ welcome, lastLoginAt: null, activeSessionCount: 0 });
    const dashboard = section(html, 'Dashboard access');
    assert.match(dashboard, /No sign-in recorded yet/);
    assert.doesNotMatch(dashboard, /Already accessed|bg-emerald-|active session/);
  }
});

test('an expired session does not erase historical access or claim a current session', async () => {
  const { html } = await renderPage({ activeSessionCount: 0 });
  const dashboard = section(html, 'Dashboard access');
  assert.match(dashboard, /Already accessed/);
  assert.doesNotMatch(dashboard, /active session/);
});

for (const [status, label] of [
  ['SENT', 'Sent —'], ['QUEUED', 'Queued —'], ['PROCESSING', 'Processing —'],
  ['FAILED', 'Not sent (failed) —'], ['SKIPPED', 'Not sent (skipped) —'],
]) {
  test(`${status} retains its own email state independently of dashboard access`, async () => {
    const { html } = await renderPage({ welcome: { ...cancelled, status } });
    const email = section(html, 'Welcome email');
    assert.ok(email.includes(label));
    assert.match(section(html, 'Dashboard access'), /Already accessed/);
    assert.doesNotMatch(email, /Reason:|Superseded by/);
    if (status === 'FAILED') assert.match(email, /bg-red-/);
    if (status === 'QUEUED' || status === 'PROCESSING') assert.match(email, /bg-amber-/);
  });
}

test('missing invitation is not mistaken for cancellation; admin controls and activity remain intact', async () => {
  const { html, userQuery } = await renderPage({ welcome: null, isActive: false, searchParams: { q: 'Test' } });
  assert.match(section(html, 'Welcome email'), />Not sent</);
  assert.doesNotMatch(section(html, 'Welcome email'), /cancelled|Reason:/);
  for (const expected of ['Inactive', '£45.00', 'Edit referee', 'Comms', 'Preview dashboard',
    '/admin/referees/test-referee/preview', '/admin/referees/test-referee#comms', 'No upcoming published fixtures assigned']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.equal(userQuery.where.role, 'REFEREE');
  assert.equal(userQuery.where.OR[0].name.contains, 'Test');
  assert.deepEqual(userQuery.select.refereedFixtures.where.publishedAt, { not: null });
});

test('welcome lookup selects the saved reason and cancellation time from the newest invitation', async () => {
  const { queries } = await renderPage();
  const { text, values } = queries.find(query => query.text.includes('FROM "NotificationDispatch"'));
  assert.match(text, /d\."failureReason" AS "failureReason"/);
  assert.match(text, /CASE WHEN d\."status" = 'CANCELLED'\s+THEN COALESCE\(d\."cancelledAt", d\."processedAt", d\."createdAt"\)/);
  assert.match(text, /ORDER BY d\."sourceId", d\."createdAt" DESC, d\."id" DESC/);
  assert.deepEqual(values, [[referee.id]], 'Referee IDs remain parameterized');
  for (const identity of ["d.\"channel\" = 'EMAIL'", 'REFEREE_INVITE', 'referee-welcome-login-email', 'central_referee_welcome_invite']) {
    assert.ok(text.includes(identity), identity);
  }
  const accessQuery = queries.find(query => query.text.includes('FROM "User"')).text;
  assert.match(accessQuery, /u\."lastLoginAt"/);
  assert.match(accessQuery, /s\."expires" > NOW\(\)/);
});

test('empty results do not issue an empty IN query', async () => {
  const { html, queries } = await renderPage({ empty: true });
  assert.match(html, /No referees found/);
  assert.equal(queries.length, 0);
});

test('non-admin access is rejected before reading referee or notification data', async () => {
  await assert.rejects(renderPage({ denyAdmin: true }), /Admin required/);
});
