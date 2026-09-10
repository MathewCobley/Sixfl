import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Leave 20 MiB below the standard 250 MiB deployment ceiling for platform layers.
// Measure actual .func trees (including symlink targets), NOT compressed archives,
// source-file lengths, filesystem blocks, or Next build success alone.
export const FUNCTION_BUDGET_BYTES = 230 * 1024 * 1024;
const protectedRoutes = ['api/admin/teams/logo-export', 'admin/teams/logos'];

export function inspectFunction(directory, route) {
  let bytes = 0, files = 0;
  const forbidden = [], largeFiles = [];
  function walk(location, relative, ancestors = new Set()) {
    const real = fs.realpathSync(location);
    const info = fs.statSync(real);
    if (info.isDirectory()) {
      if (ancestors.has(real)) throw new Error(`Symlink cycle in ${route}: ${relative}`);
      const next = new Set(ancestors); next.add(real);
      for (const name of fs.readdirSync(real)) walk(path.join(real, name), relative ? `${relative}/${name}` : name, next);
      return;
    }
    if (!info.isFile()) throw new Error(`Unexpected non-file in ${route}: ${relative}`);
    bytes += info.size; files++;
    // Count each packaged name; duplicate symlink names still cost bytes.
    if (/(^|\/)\.git(\/|$)/.test(relative) || /(^|\/)\.env(?:\.|$)/.test(relative)) forbidden.push(relative);
    if (protectedRoutes.includes(route) && /(^|\/)public\//.test(relative)) forbidden.push(relative);
    largeFiles.push({ path: relative, bytes: info.size });
  }
  walk(directory, '');
  largeFiles.sort((a, b) => b.bytes - a.bytes);
  return { route, bytes, files, mib: Number((bytes / 1024 / 1024).toFixed(2)), forbidden, largest: largeFiles.slice(0, 8) };
}

export function checkFunctionBundles(root = '.vercel/output/functions') {
  if (!fs.existsSync(root)) throw new Error(`Vercel function output is missing: ${root}. Run vercel build first; this check must not silently skip.`);
  const results = [];
  function discover(directory, prefix = '') {
    for (const name of fs.readdirSync(directory)) {
      const location = path.join(directory, name);
      if (!fs.statSync(location).isDirectory()) continue;
      const route = prefix ? `${prefix}/${name}` : name;
      if (name.endsWith('.func')) {
        const config = path.join(location, '.vc-config.json');
        if (!fs.existsSync(config)) throw new Error(`Incomplete function: ${route}`);
        const runtime = JSON.parse(fs.readFileSync(config, 'utf8')).runtime;
        if (!runtime) throw new Error(`Missing runtime: ${route}`);
        results.push({ ...inspectFunction(location, route.slice(0, -5)), runtime });
      } else discover(location, route);
    }
  }
  discover(root);
  if (!results.length) throw new Error('No Vercel functions were inspected.');
  for (const route of protectedRoutes) if (!results.some(row => row.route === route)) throw new Error(`Required logo function was not packaged: ${route}`);
  const failures = results.filter(row => row.bytes > FUNCTION_BUDGET_BYTES || row.forbidden.length);
  return { budgetBytes: FUNCTION_BUDGET_BYTES, functions: results.length, failures, results: results.sort((a, b) => b.bytes - a.bytes) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = checkFunctionBundles(process.argv[2]);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
    for (const row of report.results.filter((row, index) => index < 8 || protectedRoutes.includes(row.route))) console.log(`${row.route}: ${row.mib} MiB (${row.files} files)`);
    console.log(`Measured ${report.functions} Vercel functions; budget ${FUNCTION_BUDGET_BYTES / 1024 / 1024} MiB each.`);
    for (const row of report.failures) console.error(`FAIL ${row.route}: ${row.mib} MiB; forbidden files: ${row.forbidden.slice(0, 10).join(', ') || 'none'}; largest: ${JSON.stringify(row.largest)}`);
    if (report.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
