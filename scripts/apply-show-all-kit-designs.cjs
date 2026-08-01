const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const formPath = "src/components/captain/TeamKitOrderForm.tsx";

function read() {
  return fs.readFileSync(path.join(root, formPath), "utf8");
}

function write(source) {
  fs.writeFileSync(path.join(root, formPath), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${formPath}`);
  }
  return source.replace(before, after);
}

function removeOnce(source, before) {
  return source.includes(before) ? source.replace(before, "") : source;
}

let source = read();

source = removeOnce(
  source,
  '  const [showAll, setShowAll] = useState(false);\n',
);

source = replaceOnce(
  source,
  '  const visibleDesigns = showAll ? filteredDesigns : filteredDesigns.slice(0, 30);',
  '  const visibleDesigns = filteredDesigns;',
  "all kit designs visibility",
);

source = replaceOnce(
  source,
  '                One design will be used for all nine kits. Search by supplier code, colour or style.',
  '                All available designs are shown below. Search by supplier code, colour or style to narrow the list.',
  "all designs helper copy",
);

source = removeOnce(
  source,
  [
    '',
    '            {!showAll && filteredDesigns.length > visibleDesigns.length ? (',
    '              <button',
    '                type="button"',
    '                onClick={() => setShowAll(true)}',
    '                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"',
    '              >',
    '                Show all {filteredDesigns.length} designs',
    '              </button>',
    '            ) : null}',
  ].join("\n"),
);

if (/\bshowAll\b|setShowAll|slice\(0, 30\)|Show all \{filteredDesigns\.length\} designs/.test(source)) {
  throw new Error("The collapsed kit-design control is still present.");
}

write(source);
console.log("Captain kit picker now shows every available design by default.");
