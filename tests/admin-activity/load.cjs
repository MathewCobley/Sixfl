const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// Load actual source and canonical receipt markers; only IO is replaced.
function loadSource(file, stubs = {}, cache = new Map()) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const target = id.startsWith('@/')
        ? path.resolve('src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const candidate = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
        .find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
      if (!candidate) throw new Error(`Missing source: ${id} from ${filename}`);
      return loadSource(candidate, stubs, cache);
    }
    return require(id);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

const at = (minutes = 0) => new Date(Date.UTC(2026, 8, 24, 12, minutes));
const team = { id: 'team', name: 'NEO Mercy' };
function fee(id = 'fee-1', overrides = {}) {
  return { id, amountPence: 571, paidAt: at(), team,
    teamMember: { user: { name: 'Ethan Cuthbertson', email: 'test@example.invalid' } },
    prospect: null, ...overrides };
}
function receipt(id = 'receipt-1', overrides = {}) {
  return { id, amountPence: 571, paidAt: at(), method: 'STRIPE', reference: 'pi_test',
    notes: 'Player match fee paid online. Player fee ID: fee-1', team,
    charge: { title: 'Match fee · NEO Mercy vs The Units' }, ...overrides };
}
function paymentHarness({ receipts = [], fees = [], fallbackIds = [], query } = {}) {
  const calls = [];
  const prisma = {
    paymentTransaction: { findMany: async (args) => { calls.push(['receipts', args]); return receipts.slice(0, args.take); } },
    playerMatchFee: { findMany: async (args) => { calls.push(['fees', args]); return fees.filter((item) => args.where.id.in.includes(item.id)); } },
    $queryRaw: async (sql) => { calls.push(['sql', sql]); return query ? query(sql) : fallbackIds.map((id) => ({ id })); },
  };
  const { getAdminPaymentActivity } = loadSource('src/lib/admin/payment-activity.ts', { '@/lib/prisma': { prisma } });
  return { run: getAdminPaymentActivity, calls };
}
module.exports = { loadSource, paymentHarness, fee, receipt, at, team };
