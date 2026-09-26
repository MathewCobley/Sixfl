const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react' || key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unmocked dependency in ${file}: ${key}`);
  }, mod, mod.exports);
  return mod.exports;
}
const urls = load('src/lib/seo/public-url.ts');
const locality = load('src/lib/seo/venue-locality.ts');
const shared = {
  '@/lib/seo/public-url': urls,
  '@/lib/seo/venue-locality': locality,
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
};

test('canonical origin agrees with the existing production redirect, not www/preview settings', () => {
  assert.equal(urls.PUBLIC_SITE_ORIGIN, 'https://sixfl.co.uk');
  assert.equal(urls.publicCanonicalUrl('/venues'), 'https://sixfl.co.uk/venues');
  assert.equal(urls.publicCanonicalUrl('/'), 'https://sixfl.co.uk/');
  assert.equal(urls.publicCanonicalUrl('/leagues/thirsk-wednesday-mens?type=player#register'),
    'https://sixfl.co.uk/leagues/thirsk-wednesday-mens');
  assert.equal(urls.publicCanonicalUrl('/leagues/example/fixtures'), 'https://sixfl.co.uk/leagues/example/fixtures');
  assert.equal(urls.publicCanonicalUrl('/leagues/example/stats'), 'https://sixfl.co.uk/leagues/example/stats');
  for (const bad of ['https://other.invalid/', '//other.invalid/', '/\\other.invalid/', 'venues']) {
    assert.throws(() => urls.publicCanonicalUrl(bad));
  }
});

test('public layout resolves relative canonicals but never supplies one inherited homepage canonical', () => {
  const mocks = { ...shared };
  for (const component of ['PublicHeader', 'PublicFixtureWinChanceBridge', 'PublicLeagueBadgeVisibilityBridge',
    'PublicLeagueLandingSpacingBridge', 'PublicLeagueSeasonSwitcherBridge', 'RegisterInterestClarityBridge', 'SiteFooter']) {
    mocks[`@/components/layout/${component}`] = () => null;
  }
  const { metadata } = load('src/app/(public)/layout.tsx', mocks);
  assert.equal(metadata.metadataBase.origin, urls.PUBLIC_SITE_ORIGIN);
  assert.equal(metadata.alternates?.canonical, undefined);
  assert.equal(metadata.robots, undefined, 'Do not alter public indexing permissions');
});

test('live league landing stays uncluttered and matchweek labels stay on one line', () => {
  const publicLayout = read('src/app/(public)/layout.tsx');
  const quickLinks = read('src/components/leagues/LeagueQuickLinks.tsx');
  const latestNews = read('src/components/news/LatestNews.tsx');
  const newsCard = read('src/components/news/NewsCard.tsx');

  assert.doesNotMatch(publicLayout, /PublicLeagueSeasonSwitcherBridge/);
  assert.match(quickLinks, /pathname\?\.replace\(\/\\\/$\/, ""\) === landingPath/);
  assert.match(quickLinks, /return null/);
  assert.match(latestNews, /whitespace-nowrap text-\[1\.15rem\][\s\S]*Matchweek/);
  assert.match(newsCard, /whitespace-nowrap text-\[1\.45rem\][\s\S]*Matchweek/);
});

for (const [name, address, expected] of [
  ["Queen Mary's School", 'Topcliffe, Thirsk, North Yorkshire', 'Topcliffe'],
  ['Woodhouse Grove School', 'Apperley Bridge, West Yorkshire', 'Apperley Bridge'],
  ['Colburn Leisure Centre', 'Colburn, North Yorkshire', 'Colburn'],
  ['Unknown sports venue', 'North Yorkshire', 'SIXFL venue'],
  ['Yorkshire football centre', null, 'SIXFL venue'],
  ['Community pitch', 'York, North Yorkshire', 'York'],
  ['Community pitch', 'Rawdon, Leeds, West Yorkshire', 'Rawdon'],
  ['Community pitch', 'Northallerton, North Yorkshire', 'Northallerton'],
  ['Community pitch', 'Harrogate, North Yorkshire', 'Harrogate'],
  ['Boston Spa Academy', 'Boston Spa, Wetherby', 'Wetherby'],
  ['Community pitch', 'Catterick Garrison, North Yorkshire', 'Catterick Garrison'],
  ['Harrogate branded venue', 'Topcliffe, North Yorkshire', 'Topcliffe'],
]) {
  test(`saved locality: ${name} / ${address}`, () => {
    assert.equal(locality.getVenueLocality({ name, address, postcode: null }), expected);
  });
}

async function renderVenues() {
  const rows = [
    { name: "Queen Mary's School", address: 'Topcliffe, Thirsk, North Yorkshire' },
    { name: 'Woodhouse Grove School', address: 'Apperley Bridge, West Yorkshire' },
    { name: 'Colburn Leisure Centre', address: 'Colburn, North Yorkshire' },
    { name: 'Rossett Sports Centre', address: 'Harrogate' },
  ].map((row, i) => ({ id: `synthetic-${i}`, postcode: null, notes: 'Saved venue description.',
    parkingNotes: null, pitchNotes: 'Saved pitch details', facilities: null,
    websiteUrl: 'https://venue.example.invalid/', googleMapsUrl: null, imageUrl: null, ...row }));
  let reads = 0;
  const mod = load('src/app/(public)/venues/page.tsx', { ...shared,
    '@/lib/prisma': { prisma: { venue: { findMany: async query => {
      reads++; assert.deepEqual(query.orderBy, [{ name: 'asc' }]); return rows;
    } } } },
  });
  return { html: renderToStaticMarkup(await mod.default()), metadata: mod.metadata, reads };
}

test('actual venues page exposes meaningful metadata and retains cards, saved details, maps and registration', async () => {
  const { html, metadata, reads } = await renderVenues();
  assert.equal(reads, 1);
  assert.equal(metadata.alternates.canonical, 'https://sixfl.co.uk/venues');
  assert.match(metadata.title, /6-a-side Football Venues.*SIXFL/);
  assert.ok(metadata.description.length > 80);
  assert.match(html, /6-a-side football venues/);
  for (const location of ['Topcliffe', 'Apperley Bridge', 'Colburn']) {
    assert.match(html, new RegExp(`Location<\/div><div[^>]*>${location}<\/div>`));
  }
  assert.doesNotMatch(html, /Location<\/div><div[^>]*>York<\/div>/);
  for (const preserved of ['Saved venue description.', 'Saved pitch details', 'Rossett Sports Centre',
    'Boston Spa Academy', 'Ripon Grammar School', 'St John Fisher', 'King James',
    'REGISTER YOUR TEAM', 'VENUE WEBSITE', 'OPEN MAPS', 'CONTACT SIXFL',
    '/register-interest?type=team', 'loading="lazy"', 'https://venue.example.invalid/']) {
    assert.ok(html.includes(preserved), preserved);
  }
  assert.equal((html.match(/<iframe\b/g) || []).length, 8, 'Three admin venues plus five curated venues; duplicate Rossett is excluded');
});

test('sitemap retains current league subroutes and published news with accurate timestamps on the canonical host', async () => {
  const updatedAt = new Date('2026-09-14T12:00:00Z');
  const { default: sitemap } = load('src/app/sitemap.ts', { ...shared,
    '@/lib/current-leagues': { getCurrentLeagueIds: async () => ['current-id', 'retired-id'] },
    '@/lib/prisma': { prisma: { league: { findMany: async query => {
      assert.deepEqual(query.where.id.in, ['current-id', 'retired-id']);
      return [{ slug: 'thirsk-wednesday-mens', updatedAt }, { slug: 'retired-heartlands', updatedAt }];
    } } } },
    '@/lib/league-news/read': { getNewsSitemap: async () => [{ path: '/leagues/thirsk-wednesday-mens/news/test-story', updatedAt }] },
  });
  const rows = await sitemap();
  for (const row of rows) {
    const url = new URL(row.url);
    assert.equal(url.origin, urls.PUBLIC_SITE_ORIGIN);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    assert.ok(!url.pathname.includes('heartlands'));
    assert.ok(!url.pathname.startsWith('/admin'));
  }
  for (const path of ['/venues', '/harrogate-6-a-side-football', '/northallerton-6-a-side-football',
    '/wetherby-6-a-side-football', '/leagues/thirsk-wednesday-mens',
    '/leagues/thirsk-wednesday-mens/fixtures', '/leagues/thirsk-wednesday-mens/stats',
    '/leagues/thirsk-wednesday-mens/news', '/leagues/thirsk-wednesday-mens/news/test-story']) {
    assert.ok(rows.some(row => row.url === urls.publicCanonicalUrl(path)), path);
  }
  assert.equal(rows.find(row => row.url === urls.publicCanonicalUrl('/venues')).lastModified, undefined);
  assert.equal(rows.find(row => row.url.endsWith('/test-story')).lastModified, updatedAt);
  assert.equal(rows.find(row => row.url.endsWith('/thirsk-wednesday-mens')).lastModified, updatedAt);
  assert.equal(new Set(rows.map(row => row.url)).size, rows.length);
});
