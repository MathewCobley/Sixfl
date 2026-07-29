const fs = require("node:fs");
const path = require("node:path");

const PREDICTOR_LOGO_BASE64 =
  "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";

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
source = source.replace(
  'write(ctx, "NIGHT FIXTURES", WIDTH / 2, 48, {',
  'write(ctx, "NIGHTS FIXTURES", WIDTH / 2, 48, {',
);
source = source.replace(
  `  write(ctx, "A4 LANDSCAPE MATCH-NIGHT LIST", WIDTH / 2, 68, {\n    font: font(8, true),\n    fill: TEAL,\n    align: "center",\n  });\n`,
  "",
);

source = source.replace(
  `  width: number,\n  height: number,\n) {\n  roundedRect(ctx, x, y, width, height, 7);`,
  `  width: number,\n  height: number,\n  predictorLogo: Image | null,\n) {\n  roundedRect(ctx, x, y, width, height, 7);`,
);

source = source.replace(
  `  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";\n  write(ctx, "AI PREDICTOR", dividerX + predictorWidth / 2, y + 17, {\n    font: font(6.5, true),\n    fill: TEAL,\n    align: "center",\n  });\n  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 10, {`,
  `  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";\n  const badgeWidth = 72;\n  const badgeHeight = 28;\n  const badgeX = dividerX + (predictorWidth - badgeWidth) / 2;\n  const badgeY = y + 5;\n\n  roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 7);\n  ctx.fillStyle = "#000000";\n  ctx.fill();\n\n  if (predictorLogo) {\n    const logoMaxWidth = badgeWidth - 8;\n    const logoMaxHeight = badgeHeight - 6;\n    const logoRatio = Math.min(\n      logoMaxWidth / predictorLogo.width,\n      logoMaxHeight / predictorLogo.height,\n    );\n    const logoWidth = predictorLogo.width * logoRatio;\n    const logoHeight = predictorLogo.height * logoRatio;\n    ctx.drawImage(\n      predictorLogo,\n      badgeX + (badgeWidth - logoWidth) / 2,\n      badgeY + (badgeHeight - logoHeight) / 2,\n      logoWidth,\n      logoHeight,\n    );\n  } else {\n    write(ctx, "AI PREDICTOR", badgeX + badgeWidth / 2, badgeY + badgeHeight / 2, {\n      font: font(6.5, true),\n      fill: "#31e981",\n      align: "center",\n      baseline: "middle",\n    });\n  }\n\n  write(ctx, prediction, dividerX + predictorWidth / 2, y + height - 8, {`,
);

source = source.replace(
  `  height: number,\n  pitch: 1 | 2,\n) {`,
  `  height: number,\n  pitch: 1 | 2,\n  predictorLogo: Image | null,\n) {`,
);
source = source.replace(
  `drawFixtureRow(ctx, fixture, x + 12, listTop + index * (rowHeight + rowGap), width - 24, rowHeight);`,
  `drawFixtureRow(\n      ctx,\n      fixture,\n      x + 12,\n      listTop + index * (rowHeight + rowGap),\n      width - 24,\n      rowHeight,\n      predictorLogo,\n    );`,
);

source = source.replace(
  `  input: { date: string; league: string; venue: string; page: number; pages: number },\n  logo: Image | null,\n) {`,
  `  input: { date: string; league: string; venue: string; page: number; pages: number },\n  logo: Image | null,\n  predictorLogo: Image | null,\n) {`,
);
source = source.replace(
  `drawPitchColumn(ctx, pitch1, MARGIN, contentY, columnWidth, contentHeight, 1);`,
  `drawPitchColumn(\n    ctx,\n    pitch1,\n    MARGIN,\n    contentY,\n    columnWidth,\n    contentHeight,\n    1,\n    predictorLogo,\n  );`,
);
source = source.replace(
  `    contentHeight,\n    2,\n  );`,
  `    contentHeight,\n    2,\n    predictorLogo,\n  );`,
);

source = source.replace(
  `  let logo: Image | null = null;\n  try {\n    logo = await loadImage(LOGO_PATH);\n  } catch (error) {\n    console.error("Could not load official SIXFL logo for night fixture PDF.", error);\n  }`,
  `  let logo: Image | null = null;\n  let predictorLogo: Image | null = null;\n  try {\n    logo = await loadImage(LOGO_PATH);\n  } catch (error) {\n    console.error("Could not load official SIXFL logo for night fixture PDF.", error);\n  }\n  try {\n    predictorLogo = await loadImage(Buffer.from(${JSON.stringify(PREDICTOR_LOGO_BASE64)}, "base64"));\n  } catch (error) {\n    console.error("Could not load SIXFL AI Predictor logo for night fixture PDF.", error);\n  }`,
);
source = source.replace(
  `      logo,\n    );`,
  `      logo,\n      predictorLogo,\n    );`,
);

source = source.replace(/SIXFL night fixtures/g, "SIXFL nights fixtures");
source = source.replace(/sixfl-night-fixtures-/g, "sixfl-nights-fixtures-");
source = source.replace(/night fixtures, pitch/g, "nights fixtures, pitch");

fs.writeFileSync(routePath, source);
console.log("Applied Nights Fixtures PDF branding and AI Predictor badge.");
