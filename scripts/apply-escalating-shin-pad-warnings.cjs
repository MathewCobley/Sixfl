const fs = require("node:fs");
const path = require("node:path");

const actionPath = path.join(
  process.cwd(),
  "src/app/(public)/referee/shin-pad-warning-actions.ts",
);
const tallyPath = path.join(
  process.cwd(),
  "src/app/api/admin/night-board/pitch-tally-sheets/route.ts",
);

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`${label} marker is missing.`);
  }
  return source.replace(from, to);
}

let action = fs.readFileSync(actionPath, "utf8");

if (!action.includes("function getWarningStageCopy(")) {
  const marker = `function buildWarningEmail(input: {\n  contactName: string;`;
  const insertion = `function getWarningStageCopy(warningNumber: number) {\n  if (warningNumber >= 3) {\n    return {\n      heading: \`THIRD SHIN PAD WARNING - ADMIN REVIEW\`,\n      subjectPrefix: \`Third shin pad warning\`,\n      opening:\n        \"This is the third recorded occasion on which players from your team have been reported for not wearing shin pads.\",\n      closing:\n        \"The matter has now been flagged for SIXFL admin review. Further breaches may result in a disciplinary charge or other sanction.\",\n    };\n  }\n\n  if (warningNumber === 2) {\n    return {\n      heading: \`SECOND SHIN PAD WARNING\`,\n      subjectPrefix: \`Second shin pad warning\`,\n      opening:\n        \"This is the second recorded occasion on which players from your team have been reported for not wearing shin pads, despite the earlier warning.\",\n      closing:\n        \"Please address this immediately. Any further breach will be escalated to SIXFL admin for disciplinary review.\",\n    };\n  }\n\n  return {\n    heading: \`SHIN PAD WARNING\`,\n    subjectPrefix: \`Shin pad warning\`,\n    opening:\n      \"It was noted at the following SIXFL fixture that a number of players from your team were not wearing shin pads.\",\n    closing:\n      \"Please ensure the issue is addressed before your team's next fixture.\",\n  };\n}\n\nfunction buildWarningEmail(input: {\n  warningNumber: number;\n  contactName: string;`;
  action = replaceRequired(action, marker, insertion, "warning stage helper");
}

action = replaceRequired(
  action,
  `}) {\n  return [\n    \`Hi \${input.contactName},\`,\n    \"\",\n    \"SHIN PAD WARNING\",\n    \"\",\n    \`It was noted at the following SIXFL fixture that a number of players from \${input.teamName} were not wearing shin pads:\`,`,
  `}) {\n  const stage = getWarningStageCopy(input.warningNumber);\n\n  return [\n    \`Hi \${input.contactName},\`,\n    \"\",\n    stage.heading,\n    \"\",\n    stage.opening,\n    \"\",\n    \`Team: \${input.teamName}\`,`,
  "warning email heading",
);

action = replaceRequired(
  action,
  `    \`This warning has been recorded against \${input.teamName}. Please ensure the issue is addressed before the team's next fixture.\`,`,
  `    \`Warning number: \${input.warningNumber}\`,\n    \"\",\n    stage.closing,`,
  "warning email closing",
);

if (!action.includes("async function getTeamWarningCount(")) {
  const marker = `async function insertWarning(input: {`;
  const helper = `async function getTeamWarningCount(teamId: string) {\n  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql\`\n    SELECT COUNT(*)::int AS \"count\"\n    FROM \"TeamShinPadWarning\"\n    WHERE \"teamId\" = \${teamId}\n  \`);\n\n  return Number(rows[0]?.count ?? 0);\n}\n\nasync function insertWarning(input: {`;
  action = replaceRequired(action, marker, helper, "warning count helper");
}

action = replaceRequired(
  action,
  `      const warningId = await insertWarning({\n        teamId,`,
  `      const previousWarningCount = await getTeamWarningCount(teamId);\n      const warningNumber = previousWarningCount + 1;\n\n      const warningId = await insertWarning({\n        teamId,`,
  "warning number calculation",
);

action = replaceRequired(
  action,
  `          subject: \`Shin pad warning: \${team.name} – \${fixture.homeTeamName} v \${fixture.awayTeamName}\`,\n          body: buildWarningEmail({\n            contactName,`,
  `          subject: \`\${getWarningStageCopy(warningNumber).subjectPrefix}: \${team.name} – \${fixture.homeTeamName} v \${fixture.awayTeamName}\`,\n          body: buildWarningEmail({\n            warningNumber,\n            contactName,`,
  "warning subject and body",
);

action = replaceRequired(
  action,
  `            originLabel: \"Shin pad warning\",\n            warningId,`,
  `            originLabel: \`Shin pad warning \${warningNumber}\`,\n            warningId,\n            warningNumber,`,
  "warning metadata",
);

fs.writeFileSync(actionPath, action);

let tally = fs.readFileSync(tallyPath, "utf8");

if (!tally.includes("function shinPadWarningStage(")) {
  const marker = `function drawTeamTallyRow(`;
  const helper = `function shinPadWarningStage(previousWarnings: number) {\n  const nextWarning = previousWarnings + 1;\n\n  if (nextWarning >= 3) {\n    return {\n      label: \`WARNING \${nextWarning} - ADMIN REVIEW\`,\n      fill: \"#991b1b\",\n    };\n  }\n\n  if (nextWarning === 2) {\n    return { label: \"SECOND WARNING\", fill: \"#c2410c\" };\n  }\n\n  return { label: \"FIRST WARNING\", fill: \"#6b7280\" };\n}\n\nfunction drawTeamTallyRow(`;
  tally = replaceRequired(tally, marker, helper, "tally warning stage helper");
}

tally = replaceRequired(
  tally,
  `  const warningTextX = warningBoxX + 15;\n  write(ctx, \"SHIN PAD WARNING\", warningTextX, warningBoxY + 4.5, {\n    font: font(4.8, true),\n    fill: \"#555555\",\n  });\n  write(\n    ctx,\n    \`PREVIOUS WARNINGS: \${input.warningCount}\`,\n    warningTextX,\n    warningBoxY + 10.5,\n    {\n      font: font(4.6, true),\n      fill: input.warningCount > 0 ? \"#9a3412\" : \"#6b7280\",\n    },\n  );`,
  `  const warningTextX = warningBoxX + 15;\n  const warningStage = shinPadWarningStage(input.warningCount);\n  write(ctx, warningStage.label, warningTextX, warningBoxY + 4.5, {\n    font: font(4.8, true),\n    fill: warningStage.fill,\n  });\n  write(\n    ctx,\n    \`PREVIOUS RECORDED: \${input.warningCount}\`,\n    warningTextX,\n    warningBoxY + 10.5,\n    {\n      font: font(4.6, true),\n      fill: warningStage.fill,\n    },\n  );`,
  "tally warning copy",
);

fs.writeFileSync(tallyPath, tally);
console.log("Applied escalating shin pad warnings and tally labels.");
