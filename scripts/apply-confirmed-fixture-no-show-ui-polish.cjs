const fs = require("node:fs");
const path = require("node:path");

require("./apply-confirmed-no-show-captain-agreement.cjs");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

{
  const file = "src/components/referee/AbandonedMatchForm.tsx";
  let source = read(file);

  if (!source.includes('const isNoShow = abandonment.reason === "NO_SHOW";')) {
    source = source.replace(
      '  if (abandonment) {\n    const responsibleName =',
      '  if (abandonment) {\n    const isNoShow = abandonment.reason === "NO_SHOW";\n    const responsibleName =',
    );
  }

  source = source.replace(
    '            Match abandoned\n          </span>',
    '            {isNoShow ? "Confirmed team no-show" : "Match abandoned"}\n          </span>',
  );

  source = source.replace(
    '        <p className="mt-3 text-xs leading-5 text-white/45">\n          No official result is created by the abandonment. The result and league outcome remain for SIXFL to decide.\n        </p>',
    '        <p className="mt-3 text-xs leading-5 text-white/45">\n          {isNoShow\n            ? "No official result is created automatically by recording the no-show. SIXFL will decide the forfeit/result outcome separately under the League Rules."\n            : "No official result is created by the abandonment. The result and league outcome remain for SIXFL to decide."}\n        </p>',
  );

  write(file, source);
}

{
  const file = "src/app/(public)/referee/night/[id]/page.tsx";
  let source = read(file);

  source = source.replace(
    '      return "Match marked as abandoned. Fee changes have been applied and both teams have been notified where applicable.";',
    '      return "Fixture outcome recorded. Any applicable fee changes have been applied and both teams have been notified.";',
  );

  source = source.replace(
    '{abandonment ? "Match abandoned · result to be decided by SIXFL" : fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
    '{abandonment ? (abandonment.reason === "NO_SHOW" ? "Confirmed team no-show · result to be decided by SIXFL" : "Match abandoned · result to be decided by SIXFL") : fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
  );

  source = source.replace(
    '                            ? "The referee abandoned this fixture. No official score is recorded; SIXFL will decide the result and league outcome separately."',
    '                            ? abandonment.reason === "NO_SHOW"\n                              ? "A confirmed team failed to attend this fixture. No official score is recorded automatically; SIXFL will decide the forfeit/result outcome separately."\n                              : "The referee abandoned this fixture. No official score is recorded; SIXFL will decide the result and league outcome separately."',
  );

  write(file, source);
}

console.log("Confirmed no-show outcomes now display separately from referee abandonments.");
