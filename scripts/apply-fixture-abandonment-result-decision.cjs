const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function patchFile(relativePath, patches) {
  const filePath = path.join(root, ...relativePath.split("/"));
  let source = fs.readFileSync(filePath, "utf8");

  for (const patch of patches) {
    if (source.includes(patch.after)) continue;
    if (!source.includes(patch.before)) {
      throw new Error(`Expected ${patch.label} source was not found in ${relativePath}.`);
    }
    source = source.replace(patch.before, patch.after);
  }

  fs.writeFileSync(filePath, source, "utf8");
}

patchFile("src/lib/fixtures/abandonment.ts", [
  {
    label: "abandonment row awarded result fields",
    before: '  awayScoreAtAbandonment: number | null;\n  recordedAt: Date;',
    after: '  awayScoreAtAbandonment: number | null;\n  awardedHomeScore: number | null;\n  awardedAwayScore: number | null;\n  resultDecidedByUserId: string | null;\n  resultDecidedAt: Date | null;\n  recordedAt: Date;',
  },
  {
    label: "abandonment result select fields",
    before: '      "homeScoreAtAbandonment",\n      "awayScoreAtAbandonment",\n      "recordedAt"',
    after: '      "homeScoreAtAbandonment",\n      "awayScoreAtAbandonment",\n      "awardedHomeScore",\n      "awardedAwayScore",\n      "resultDecidedByUserId",\n      "resultDecidedAt",\n      "recordedAt"',
  },
  {
    label: "abandonment result input",
    before: '  details?: string | null;\n  recordedByUserId: string;',
    after: '  details?: string | null;\n  awardedHomeScore?: number | null;\n  awardedAwayScore?: number | null;\n  recordedByUserId: string;',
  },
  {
    label: "abandonment result validation",
    before: '  const teamIds = [fixture.homeTeam.id, fixture.awayTeam.id];\n  const responsibleTeamId = input.responsibleTeamId?.trim() || null;',
    after: '  const teamIds = [fixture.homeTeam.id, fixture.awayTeam.id];\n  const responsibleTeamId = input.responsibleTeamId?.trim() || null;\n  const awardedHomeScore = input.awardedHomeScore ?? null;\n  const awardedAwayScore = input.awardedAwayScore ?? null;\n  const hasOfficialResult = awardedHomeScore !== null || awardedAwayScore !== null;\n\n  if (hasOfficialResult) {\n    if (awardedHomeScore === null || awardedAwayScore === null) {\n      throw new Error("Both official scores are required when SIXFL awards a result.");\n    }\n    if (!Number.isInteger(awardedHomeScore) || !Number.isInteger(awardedAwayScore) || awardedHomeScore < 0 || awardedAwayScore < 0) {\n      throw new Error("Official abandoned-match scores must be whole numbers 0 or greater.");\n    }\n  }',
  },
  {
    label: "abandonment official result transaction",
    before: '    if (fixture.result) {\n      await tx.matchResult.delete({ where: { fixtureId: fixture.id } });\n    }\n\n    await tx.fixture.update({\n      where: { id: fixture.id },\n      data: { status: FixtureStatus.CANCELLED },\n    });',
    after: '    if (fixture.result) {\n      await tx.matchResult.delete({ where: { fixtureId: fixture.id } });\n    }\n\n    if (hasOfficialResult) {\n      await tx.matchResult.create({\n        data: {\n          fixtureId: fixture.id,\n          homeScore: awardedHomeScore,\n          awayScore: awardedAwayScore,\n          enteredByUserId: input.recordedByUserId,\n          enteredAt: new Date(),\n          isDisputed: false,\n          disputeNote: null,\n        },\n      });\n    }\n\n    await tx.fixture.update({\n      where: { id: fixture.id },\n      data: { status: hasOfficialResult ? FixtureStatus.COMPLETED : FixtureStatus.CANCELLED },\n    });',
  },
  {
    label: "abandonment result audit columns",
    before: '        "homeScoreAtAbandonment",\n        "awayScoreAtAbandonment",\n        "recordedByUserId",',
    after: '        "homeScoreAtAbandonment",\n        "awayScoreAtAbandonment",\n        "awardedHomeScore",\n        "awardedAwayScore",\n        "resultDecidedByUserId",\n        "resultDecidedAt",\n        "recordedByUserId",',
  },
  {
    label: "abandonment result audit values",
    before: '        ${fixture.result?.homeScore ?? null},\n        ${fixture.result?.awayScore ?? null},\n        ${input.recordedByUserId},',
    after: '        ${fixture.result?.homeScore ?? null},\n        ${fixture.result?.awayScore ?? null},\n        ${awardedHomeScore},\n        ${awardedAwayScore},\n        ${hasOfficialResult ? input.recordedByUserId : null},\n        ${hasOfficialResult ? new Date() : null},\n        ${input.recordedByUserId},',
  },
  {
    label: "abandonment decision line",
    before: '  const reasonLabel = reason.label;\n  const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;\n  const dispatchIds: string[] = [];',
    after: '  const reasonLabel = reason.label;\n  const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;\n  const officialResultLine = hasOfficialResult\n    ? `SIXFL has awarded the official result: ${fixture.homeTeam.name} ${awardedHomeScore}-${awardedAwayScore} ${fixture.awayTeam.name}.`\n    : "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.";\n  const dispatchIds: string[] = [];',
  },
  {
    label: "responsible team email result",
    before: '      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",',
    after: '      officialResultLine,',
  },
  {
    label: "innocent team email result",
    before: '      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",',
    after: '      officialResultLine,',
  },
  {
    label: "neutral team email result",
    before: '          "The league/result outcome will also be decided by SIXFL after review.",',
    after: '          officialResultLine,',
  },
]);

patchFile("src/app/(public)/referee/abandonment-actions.ts", [
  {
    label: "abandonment result parse",
    before: '  const details = String(formData.get("details") ?? "").trim() || null;\n  const confirmed = String(formData.get("confirmAbandonment") ?? "") === "yes";',
    after: '  const details = String(formData.get("details") ?? "").trim() || null;\n  const resultDecision = String(formData.get("resultDecision") ?? "PENDING").trim();\n  const confirmed = String(formData.get("confirmAbandonment") ?? "") === "yes";\n\n  let awardedHomeScore: number | null = null;\n  let awardedAwayScore: number | null = null;\n  if (resultDecision === "HOME_3_0") {\n    awardedHomeScore = 3;\n    awardedAwayScore = 0;\n  } else if (resultDecision === "AWAY_3_0") {\n    awardedHomeScore = 0;\n    awardedAwayScore = 3;\n  } else if (resultDecision !== "PENDING") {\n    throw new Error("Choose a valid abandoned-match result decision.");\n  }\n\n  if (resultDecision !== "PENDING" && user.role !== UserRole.ADMIN) {\n    throw new Error("Only SIXFL admin can award an official result for an abandoned match.");\n  }',
  },
  {
    label: "abandonment result action input",
    before: '    responsibleTeamId,\n    details,\n    recordedByUserId: user.id,',
    after: '    responsibleTeamId,\n    details,\n    awardedHomeScore,\n    awardedAwayScore,\n    recordedByUserId: user.id,',
  },
]);

patchFile("src/components/referee/AbandonedMatchForm.tsx", [
  {
    label: "abandonment result prop",
    before: '  abandonment,\n  locked,\n}: {',
    after: '  abandonment,\n  locked,\n  canDecideResult,\n}: {',
  },
  {
    label: "abandonment result prop type",
    before: '  abandonment: FixtureAbandonmentRow | null;\n  locked: boolean;\n}) {',
    after: '  abandonment: FixtureAbandonmentRow | null;\n  locked: boolean;\n  canDecideResult: boolean;\n}) {',
  },
  {
    label: "abandonment recorded result copy",
    before: '        <p className="mt-3 text-xs leading-5 text-white/45">\n          No official result is created by the abandonment. The result and league outcome remain for SIXFL to decide.\n        </p>',
    after: '        <p className="mt-3 text-xs leading-5 text-white/45">\n          {abandonment.awardedHomeScore !== null && abandonment.awardedAwayScore !== null\n            ? `Official SIXFL result: ${homeTeam.name} ${abandonment.awardedHomeScore}-${abandonment.awardedAwayScore} ${awayTeam.name}.`\n            : "No official result has been awarded yet. The result and league outcome remain for SIXFL to decide."}\n        </p>',
  },
  {
    label: "abandonment result selector",
    before: '        <label className="block text-sm text-white/75">\n          <span className="font-semibold text-white">Referee details</span>',
    after: '        {canDecideResult ? (\n          <label className="block text-sm text-white/75">\n            <span className="font-semibold text-white">SIXFL result decision</span>\n            <span className="ml-2 text-xs text-white/40">This is the official league result and will be included in both emails</span>\n            <select\n              name="resultDecision"\n              defaultValue="PENDING"\n              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/50 px-3 text-white outline-none"\n            >\n              <option value="PENDING">Decide result later</option>\n              <option value="HOME_3_0">Award 3-0 to {homeTeam.name}</option>\n              <option value="AWAY_3_0">Award 3-0 to {awayTeam.name}</option>\n            </select>\n          </label>\n        ) : (\n          <input type="hidden" name="resultDecision" value="PENDING" />\n        )}\n\n        <label className="block text-sm text-white/75">\n          <span className="font-semibold text-white">Referee details</span>',
  },
  {
    label: "abandonment confirmation result wording",
    before: '            I confirm the referee abandoned this match. I understand this removes any entered score as the official result, applies the fee rule where a responsible team is selected, and emails both teams.',
    after: '            I confirm the referee abandoned this match. I understand this replaces any entered score with the SIXFL result decision above (or leaves it pending), applies the fee rule where a responsible team is selected, and emails both teams.',
  },
]);

patchFile("src/app/(public)/referee/night/[id]/page.tsx", [
  {
    label: "abandonment result permission",
    before: '                      abandonment={abandonment}\n                      locked={locked}\n                    />',
    after: '                      abandonment={abandonment}\n                      locked={locked}\n                      canDecideResult={user.role === UserRole.ADMIN}\n                    />',
  },
  {
    label: "abandonment result display",
    before: '                            ? "The referee abandoned this fixture. No official score is recorded; SIXFL will decide the result and league outcome separately."',
    after: '                            ? abandonment.awardedHomeScore !== null && abandonment.awardedAwayScore !== null\n                              ? `Official SIXFL result: ${fixture.homeTeam.name} ${abandonment.awardedHomeScore}-${abandonment.awardedAwayScore} ${fixture.awayTeam.name}.`\n                              : "The referee abandoned this fixture. No official score is recorded yet; SIXFL will decide the result and league outcome separately."',
  },
]);

console.log("Applied abandoned-match official result decision and email wording.");
