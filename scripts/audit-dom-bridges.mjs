import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(process.cwd(), "src");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const RULES = [
  { name: "MutationObserver", pattern: /\bMutationObserver\b/g },
  { name: "DOM query", pattern: /\bdocument\.(?:querySelector|querySelectorAll|getElementById|getElementsByClassName)\b/g },
  { name: "DOM element creation", pattern: /\bdocument\.createElement\b/g },
  { name: "DOM insertion", pattern: /\.(?:appendChild|insertBefore|replaceWith|insertAdjacentElement|insertAdjacentHTML)\s*\(/g },
  { name: "DOM removal", pattern: /\.(?:remove|removeChild)\s*\(/g },
  { name: "HTML replacement", pattern: /\.(?:innerHTML|outerHTML)\s*=/g },
  { name: "Class mutation", pattern: /\.classList\.(?:add|remove|replace|toggle)\s*\(/g },
  { name: "Style mutation", pattern: /\.style\.[A-Za-z_$][\w$]*\s*=/g },
  { name: "Global DOM monkey patch", pattern: /(?:Element|HTMLElement)\.prototype\.[A-Za-z_$][\w$]*\s*=/g },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

const files = await walk(ROOT);
const findings = [];

for (const file of files) {
  const content = await readFile(file, "utf8");

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;

    while ((match = rule.pattern.exec(content)) !== null) {
      findings.push({
        file: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
        line: getLineNumber(content, match.index),
        rule: rule.name,
        token: match[0],
      });
    }
  }
}

const byFile = new Map();
for (const finding of findings) {
  const list = byFile.get(finding.file) ?? [];
  list.push(finding);
  byFile.set(finding.file, list);
}

console.log(`DOM bridge audit: ${byFile.size} file(s), ${findings.length} suspicious operation(s).`);

for (const [file, fileFindings] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file}`);
  for (const finding of fileFindings) {
    console.log(`  L${finding.line}  ${finding.rule}: ${finding.token}`);
  }
}

if (byFile.size > 0) {
  console.log("\nThese findings are an audit list, not an automatic failure. Review page-scraping and post-render injection first.");
}
