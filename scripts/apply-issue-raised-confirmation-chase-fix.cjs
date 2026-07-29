const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

replaceOnce(
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED" && status !== "ISSUE_RAISED";\n}',
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED";\n}',
);

replaceOnce(
  "src/lib/fixtures/confirmation-reminders.ts",
  '  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
  '  if (\n    input.mode !== "manual" &&\n    existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED\n  ) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
);

replaceOnce(
  "src/app/api/admin/night-board/pitch-tally-sheets/route.ts",
  '  ctx.font = font(9.5, true);\n  write(\n    ctx,\n    fit(ctx, input.teamName, teamWidth - 27),\n    input.x + 23,\n    input.y + 25,\n    { font: font(9.5, true) },\n  );',
  '  ctx.font = font(9, true);\n  write(\n    ctx,\n    fit(ctx, input.teamName, teamWidth - 27),\n    input.x + 23,\n    input.y + 17,\n    { font: font(9, true) },\n  );\n\n  const shinPadBoxX = input.x + 23;\n  const shinPadBoxY = input.y + 23;\n  ctx.fillStyle = "#ffffff";\n  ctx.strokeStyle = "#111111";\n  ctx.lineWidth = 0.8;\n  ctx.fillRect(shinPadBoxX, shinPadBoxY, 9, 9);\n  ctx.strokeRect(shinPadBoxX, shinPadBoxY, 9, 9);\n  write(ctx, "SHIN PADS", shinPadBoxX + 13, shinPadBoxY + 8, {\n    font: font(5.8, true),\n    fill: "#555555",\n  });',
);

console.log("Applied fixture confirmation chase support and tally-sheet shin pad checkbox.");
