import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Whole-site ceiling leaves 10 MiB below Vercel's standard 250 MiB limit;
// warn at 230 MiB. The two repaired logo routes have a tighter 150 MiB budget.
// Vercel createZip stores internal symlinks as link-text entries, not duplicate
// dependencies. External-source links are measured conservatively as contents.
export const FUNCTION_BUDGET_BYTES = 240 * 1024 * 1024;
export const LOGO_FUNCTION_BUDGET_BYTES = 150 * 1024 * 1024;
export const FUNCTION_WARNING_BYTES = 230 * 1024 * 1024;
const protectedRoutes = ['api/admin/teams/logo-export', 'admin/teams/logos'];
const isLogoRoute = route => protectedRoutes.includes(route.replace(/\.rsc$/, ''));
const sensitive = name => /(^|\/)\.git(\/|$)/.test(name) || /(^|\/)\.env(?:\.|$)/.test(name);

export function inspectFunction(directory, route) {
  const functionRoot = fs.realpathSync(directory);
  let bytes = 0, files = 0, internalSymlinks = 0, materialisedSymlinks = 0;
  const forbidden = [], largeFiles = [];
  function add(relative, size) {
    bytes += size; files++;
    if (sensitive(relative) || (isLogoRoute(route) && /(^|\/)public\//.test(relative))) forbidden.push(relative);
    largeFiles.push({ path: relative, bytes: size });
  }
  function walk(location, relative, ancestors = new Set()) {
    const link = fs.lstatSync(location);
    const real = fs.realpathSync(location);
    if (link.isSymbolicLink()) {
      if (sensitive(real.split(path.sep).join('/'))) forbidden.push(relative);
      if (ancestors.has(real)) throw new Error(`Symlink cycle in ${route}: ${relative}`);
      if (real === functionRoot || real.startsWith(functionRoot + path.sep)) {
        // The target is already represented elsewhere in this package. Vercel's
        // ZIP entry contains the UTF-8 link target; do not double-count its bytes.
        internalSymlinks++;
        add(relative, Buffer.byteLength(fs.readlinkSync(location), 'utf8'));
        return;
      }
      materialisedSymlinks++;
    }
    const info = fs.statSync(real);
    if (info.isDirectory()) {
      if (ancestors.has(real)) throw new Error(`Symlink cycle in ${route}: ${relative}`);
      const next = new Set(ancestors); next.add(real);
      for (const name of fs.readdirSync(real)) walk(path.join(real, name), relative ? `${relative}/${name}` : name, next);
      return;
    }
    if (!info.isFile()) throw new Error(`Unexpected non-file in ${route}: ${relative}`);
    // Different regular-file names, including hard links, cost bytes separately.
    add(relative, info.size);
  }
  walk(functionRoot, '');
  largeFiles.sort((a, b) => b.bytes - a.bytes);
  return { route, bytes, files, internalSymlinks, materialisedSymlinks, mib: Number((bytes / 1024 / 1024).toFixed(2)), forbidden, largest: largeFiles.slice(0, 8) };
}

export function checkFunctionBundles(root = '.vercel/output/functions') {
  if (!fs.existsSync(root)) throw new Error(`Vercel function output is missing: ${root}. Run vercel build first; this check must not silently skip.`);
  const results = [], cache = new Map(), packages = new Set();
  function discover(directory, prefix = '', ancestors = new Set()) {
    const realDirectory = fs.realpathSync(directory);
    if (ancestors.has(realDirectory)) throw new Error(`Symlink cycle discovering functions: ${prefix}`);
    const next = new Set(ancestors); next.add(realDirectory);
    for (const name of fs.readdirSync(directory)) {
      const location = path.join(directory, name);
      if (!fs.statSync(location).isDirectory()) continue;
      const outputPath = prefix ? `${prefix}/${name}` : name;
      if (name.endsWith('.func')) {
        const route = outputPath.slice(0, -5), canonical = fs.realpathSync(location);
        const config = path.join(location, '.vc-config.json');
        if (!fs.existsSync(config)) throw new Error(`Incomplete function: ${route}`);
        const runtime = JSON.parse(fs.readFileSync(config, 'utf8')).runtime;
        if (!runtime) throw new Error(`Missing runtime: ${route}`);
        const key = canonical + ':' + isLogoRoute(route);
        if (!cache.has(key)) cache.set(key, inspectFunction(location, route));
        packages.add(canonical);
        results.push({ ...cache.get(key), route, runtime, budgetBytes: isLogoRoute(route) ? LOGO_FUNCTION_BUDGET_BYTES : FUNCTION_BUDGET_BYTES });
      } else discover(location, outputPath, next);
    }
  }
  discover(root);
  if (!results.length) throw new Error('No Vercel functions were inspected.');
  for (const route of protectedRoutes) if (!results.some(row => row.route === route)) throw new Error(`Required logo function was not packaged: ${route}`);
  const failures = results.filter(row => row.bytes > row.budgetBytes || row.forbidden.length);
  const warnings = results.filter(row => row.bytes > FUNCTION_WARNING_BYTES && !failures.includes(row));
  return { budgetBytes: FUNCTION_BUDGET_BYTES, logoBudgetBytes: LOGO_FUNCTION_BUDGET_BYTES, warningBytes: FUNCTION_WARNING_BYTES, functions: results.length, uniquePackages: packages.size, failures, warnings, results: results.sort((a, b) => b.bytes - a.bytes) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = checkFunctionBundles(process.argv[2]);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
    for (const row of report.results.filter((row, index) => index < 8 || protectedRoutes.includes(row.route))) console.log(`${row.route}: ${row.mib} MiB (${row.files} entries; ${row.internalSymlinks} internal aliases)`);
    console.log(`Measured ${report.functions} Vercel output entries (${report.uniquePackages} distinct package directories); budgets ${FUNCTION_BUDGET_BYTES / 1024 / 1024} MiB general / ${LOGO_FUNCTION_BUDGET_BYTES / 1024 / 1024} MiB logo routes.`);
    for (const row of report.warnings) console.warn(`SIZE WARNING ${row.route}: ${row.mib} MiB exceeds the 230 MiB early-warning threshold; retain headroom before further changes.`);
    for (const row of report.failures) console.error(`FAIL ${row.route}: ${row.mib} MiB (budget ${row.budgetBytes / 1024 / 1024}); forbidden files: ${row.forbidden.slice(0, 10).join(', ') || 'none'}; largest: ${JSON.stringify(row.largest)}`);
    if (report.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
