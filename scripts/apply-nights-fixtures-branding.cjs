const fs = require("node:fs");
const path = require("node:path");

const routePath = path.join(
  process.cwd(),
  "src",
  "app",
  "api",
  "admin",
  "night-board",
  "night-fixtures",
  "route.ts",
);

if (!fs.existsSync(routePath)) {
  console.log("Nights Fixtures route not present; skipping branding patch.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

source = source.replace(
  'ctx.drawImage(logo, MARGIN, 18, logo.width * ratio, logo.height * ratio);',
  'ctx.drawImage(logo, MARGIN + 28, 18, logo.width * ratio, logo.height * ratio);',
);
source = source.replace('write(ctx, "NIGHT FIXTURES", WIDTH / 2, 48, {', 'write(ctx, "NIGHTS FIXTURES", WIDTH / 2, 48, {');
source = source.replace(
  `  write(ctx, "A4 LANDSCAPE MATCH-NIGHT LIST", WIDTH / 2, 68, {\n    font: font(8, true),\n    fill: TEAL,\n    align: "center",\n  });\n`,
  "",
);

source = source.replace(
  `  width: number,\n  height: number,\n) {\n  roundedRect(ctx, x, y, width, height, 7);`,
  `  width: number,\n  height: number,\n  logo: Image | null,\n) {\n  roundedRect(ctx, x, y, width, height, 7);`,
);

source = source.replace(
  `  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";\n  write(ctx, "AI PREDICTOR", dividerX + predictorWidth / 2, y + 17, {\n    font: font(6.5, true),\n    fill: TEAL,\n    align: "center",\n  });\n  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 10, {`,
  `  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";\n  if (logo) {\n    const logoMaxWidth = 70;\n    const logoMaxHeight = 14;\n    const logoRatio = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);\n    const logoWidth = logo.width * logoRatio;\n    const logoHeight = logo.height * logoRatio;\n    ctx.drawImage(\n      logo,\n      dividerX + (predictorWidth - logoWidth) / 2,\n      y + 6,\n      logoWidth,\n      logoHeight,\n    );\n  } else {\n    write(ctx, "AI PREDICTOR", dividerX + predictorWidth / 2, y + 17, {\n      font: font(6.5, true),\n      fill: TEAL,\n      align: "center",\n    });\n  }\n  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 12, {`,
);

source = source.replace(
  `  height: number,\n  pitch: 1 | 2,\n) {`,
  `  height: number,\n  pitch: 1 | 2,\n  logo: Image | null,\n) {`,
);
source = source.replace(
  `drawFixtureRow(ctx, fixture, x + 12, listTop + index * (rowHeight + rowGap), width - 24, rowHeight);`,
  `drawFixtureRow(\n      ctx,\n      fixture,\n      x + 12,\n      listTop + index * (rowHeight + rowGap),\n      width - 24,\n      rowHeight,\n      logo,\n    );`,
);
source = source.replace(
  `drawPitchColumn(ctx, pitch1, MARGIN, contentY, columnWidth, contentHeight, 1);`,
  `drawPitchColumn(ctx, pitch1, MARGIN, contentY, columnWidth, contentHeight, 1, logo);`,
);
source = source.replace(
  `    contentHeight,\n    2,\n  );`,
  `    contentHeight,\n    2,\n    logo,\n  );`,
);
source = source.replace(/SIXFL night fixtures/g, "SIXFL nights fixtures");
source = source.replace(/sixfl-night-fixtures-/g, "sixfl-nights-fixtures-");
source = source.replace(/night fixtures, pitch/g, "nights fixtures, pitch");

fs.writeFileSync(routePath, source);
console.log("Applied Nights Fixtures PDF branding patch.");
