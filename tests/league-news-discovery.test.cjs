const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const templateFile = 'src/app/captain/team/[teamid]/template.tsx';
const modeFile = 'src/components/captain/CaptainPwaModeOnly.tsx';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Execute the real template AND mode detector. Only React's state/effect runtime
// and nonessential leaf components are isolated. Counting JSX occurrences alone
// mistakes two mutually exclusive app/web branches for two displayed panels.
// These are component tests, not a replacement for the existing browser suite.
function discoveryHarness(options = {}, replacements = {}) {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const Fragment = Symbol('fragment');
  const instances = new Map();
  const effects = [];
  let current = null;
  const hooks = {
    useState(initial) {
      assert.ok(current, 'state must belong to a component instance');
      const owner = current, index = owner.cursor++;
      if (!Object.hasOwn(owner.state, index)) owner.state[index] = initial;
      return [owner.state[index], value => { owner.state[index] = value; }];
    },
    useEffect(effect, dependencies) {
      assert.ok(current, 'effects must belong to a component instance');
      const owner = current, index = owner.cursor++;
      const previous = owner.dependencies[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        owner.dependencies[index] = [...dependencies];
        effects.push(effect);
      }
    },
  };
  const window = {
    location: {
      origin: 'https://sixfl.example',
      pathname: '/captain/team/example',
      search: options.search ?? '',
    },
    matchMedia(query) {
      assert.equal(query, '(display-mode: standalone)');
      return { matches: Boolean(options.standalone) };
    },
  };
  window.self = window;
  window.top = options.frame ? {} : window;
  window.parent = options.frame ? {
    get location() {
      if (options.crossOrigin) throw new Error('Cross-origin frame access denied');
      return { origin: window.location.origin, pathname: options.parentPath ?? '/admin/pwa' };
    },
  } : window;
  const navigator = options.iosStandalone === undefined ? {} : { standalone: options.iosStandalone };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const compiled = ts.transpileModule(replacements[file] ?? read(file), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    vm.runInNewContext(compiled.outputText, {
      module, exports: module.exports, window, navigator, URLSearchParams,
      require(id) {
        if (id === 'react') return hooks;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment };
        if (id === '@/components/news/LatestNews') return { default: ({ scope }) => jsx('news', { scope }) };
        if (id === '@/components/captain/CaptainTeamScrollToTop') return { default: () => null };
        if (id === '@/components/captain/CaptainPwaModeOnly') return load(modeFile);
        throw new Error(`Unexpected discovery dependency: ${id}`);
      },
    }, { filename: file, timeout: 1000 });
    cache.set(file, module.exports);
    return module.exports;
  }
  const Template = load(templateFile).default;
  function visit(node, key) {
    if (Array.isArray(node)) return Array.from(node).flatMap((child, index) => visit(child, `${key}.${index}`));
    if (node == null || node === false) return [];
    if (node.type === Fragment) return visit(node.props.children, `${key}.fragment`);
    if (typeof node.type === 'function') {
      if (!instances.has(key)) instances.set(key, { state: [], dependencies: [] });
      const previous = current;
      current = instances.get(key);
      current.cursor = 0;
      let result;
      try { result = node.type(node.props); } finally { current = previous; }
      return visit(result, `${key}.output`);
    }
    return [node];
  }
  return {
    render: () => visit(jsx(Template, { children: jsx('page') }), 'root'),
    flushEffects() { for (const effect of effects.splice(0)) effect(); },
  };
}

function assertDiscovery(mode, options = {}, replacements = {}) {
  const harness = discoveryHarness(options, replacements);
  assert.deepEqual(harness.render().map(node => node.type), ['page'], 'no duplicate news before mode resolution');
  harness.flushEffects();
  const expected = mode === 'app' ? ['page'] : ['news', 'page'];
  for (let render = 0; render < 2; render++) {
    const nodes = harness.render();
    assert.deepEqual(nodes.map(node => node.type), expected, 'template news is in the correct mode and position');
    if (mode === 'web') {
      assert.equal(nodes.find(node => node.type === 'news').props.scope, 'captain');
    }
    harness.flushEffects();
  }
}

for (const [label, mode, options] of [
  ['ordinary browser', 'web', {}],
  ['non-standalone iOS browser', 'web', { iosStandalone: false }],
  ['installed standalone app', 'app', { standalone: true }],
  ['installed iOS app', 'app', { iosStandalone: true }],
  ['explicit app preview', 'app', { search: '?pwaPreview=1' }],
  ['disabled app preview', 'web', { search: '?pwaPreview=0' }],
  ['same-origin admin phone preview', 'app', { frame: true }],
  ['ordinary embedded page', 'web', { frame: true, parentPath: '/other' }],
  ['cross-origin frame', 'web', { frame: true, crossOrigin: true }],
]) {
  test(`captain news is shown exactly once: ${label}`, () => assertDiscovery(mode, options));
}

test('discovery regression detects a genuinely duplicated visible panel', () => {
  const original = read(modeFile);
  const broken = original.replace('return resolvedMode === mode ? <>{children}</> : null;', 'return <>{children}</>;');
  assert.notEqual(broken, original, 'negative control must alter the real mode guard');
  assert.throws(
    () => assertDiscovery('app', { standalone: true }, { [modeFile]: broken }),
    assert.AssertionError,
  );
});

test('installed app news is owned by the captain Home screen, not appended by the template', () => {
  const template = read(templateFile);
  const overview = read('src/app/captain/team/[teamid]/page.tsx');
  const home = read('src/components/captain/CaptainAppHomeView.tsx');

  assert.doesNotMatch(template, /<CaptainPwaModeOnly mode="app">[\s\S]*?<LatestNews/);
  assert.match(
    overview,
    /news=\{<LatestNews scope="captain" presentation="integrated" \/>\}/,
  );
  assert.match(home, /\{news \? <div className=\{styles\.newsSlot\}>\{news\}<\/div> : null\}/);
  assert.ok(
    home.indexOf('styles.newsSlot') < home.indexOf('aria-label="Team tools"'),
    'news belongs in the Home flow before the tool grid rather than after the page',
  );
});

test('discovery regression detects a news panel using the wrong audience', () => {
  const original = read(templateFile);
  const broken = original.replaceAll('scope="captain"', 'scope="player"');
  assert.notEqual(broken, original, 'negative control must change the audience');
  assert.throws(() => assertDiscovery('web', {}, { [templateFile]: broken }), assert.AssertionError);

  const overview = read('src/app/captain/team/[teamid]/page.tsx');
  assert.match(overview, /<LatestNews scope="captain" presentation="integrated" \/>/);
});
