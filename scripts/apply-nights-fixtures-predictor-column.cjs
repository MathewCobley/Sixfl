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
  console.log("Nights Fixtures route not present; skipping predictor-column layout.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

// Put the main SIXFL logo on a proper black rounded backing so the white logo
// remains readable in the printed PDF.
if (!source.includes("const logoBoxWidth = 178;")) {
  const headerLogoPattern = /  if \(logo\) \{\n    const maxWidth = 154;\n    const maxHeight = 54;\n    const ratio = Math\.min\(maxWidth \/ logo\.width, maxHeight \/ logo\.height\);\n    ctx\.drawImage\(logo, MARGIN(?: \+ 28)?, 18, logo\.width \* ratio, logo\.height \* ratio\);\n  \} else \{/;

  if (!headerLogoPattern.test(source)) {
    throw new Error("Expected Nights Fixtures header logo block was not found.");
  }

  source = source.replace(
    headerLogoPattern,
    [
      "  if (logo) {",
      "    const logoBoxX = MARGIN + 28;",
      "    const logoBoxY = 10;",
      "    const logoBoxWidth = 178;",
      "    const logoBoxHeight = 68;",
      "",
      "    roundedRect(ctx, logoBoxX, logoBoxY, logoBoxWidth, logoBoxHeight, 10);",
      '    ctx.fillStyle = "#000000";',
      "    ctx.fill();",
      "",
      "    const maxWidth = 158;",
      "    const maxHeight = 48;",
      "    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);",
      "    const logoWidth = logo.width * ratio;",
      "    const logoHeight = logo.height * ratio;",
      "    ctx.drawImage(",
      "      logo,",
      "      logoBoxX + (logoBoxWidth - logoWidth) / 2,",
      "      logoBoxY + (logoBoxHeight - logoHeight) / 2,",
      "      logoWidth,",
      "      logoHeight,",
      "    );",
      "  } else {",
    ].join("\n"),
  );
}

// The predictor brand belongs once at the top of each pitch column, not as a
// tiny unreadable image repeated inside every fixture row.
if (!source.includes("const predictorHeaderWidth = 150;")) {
  const headingAnchor =
    "  drawPitchHeading(ctx, x + 12, y + 8, width - 24, pitch);\n  const listTop = y + 54;";

  if (!source.includes(headingAnchor)) {
    throw new Error("Expected Nights Fixtures pitch heading anchor was not found.");
  }

  source = source.replace(
    headingAnchor,
    [
      "  drawPitchHeading(ctx, x + 12, y + 8, width - 24, pitch);",
      "",
      "  const predictorHeaderWidth = 150;",
      "  const predictorHeaderHeight = 38;",
      "  const predictorHeaderX = x + (width - predictorHeaderWidth) / 2;",
      "  const predictorHeaderY = y + 45;",
      "",
      "  roundedRect(",
      "    ctx,",
      "    predictorHeaderX,",
      "    predictorHeaderY,",
      "    predictorHeaderWidth,",
      "    predictorHeaderHeight,",
      "    8,",
      "  );",
      '  ctx.fillStyle = "#000000";',
      "  ctx.fill();",
      "",
      "  if (predictorLogo) {",
      "    const maxLogoWidth = predictorHeaderWidth - 16;",
      "    const maxLogoHeight = predictorHeaderHeight - 8;",
      "    const logoRatio = Math.min(",
      "      maxLogoWidth / predictorLogo.width,",
      "      maxLogoHeight / predictorLogo.height,",
      "    );",
      "    const predictorLogoWidth = predictorLogo.width * logoRatio;",
      "    const predictorLogoHeight = predictorLogo.height * logoRatio;",
      "    ctx.drawImage(",
      "      predictorLogo,",
      "      predictorHeaderX + (predictorHeaderWidth - predictorLogoWidth) / 2,",
      "      predictorHeaderY + (predictorHeaderHeight - predictorLogoHeight) / 2,",
      "      predictorLogoWidth,",
      "      predictorLogoHeight,",
      "    );",
      "  } else {",
      '    write(ctx, "SIXFL AI PREDICTOR", x + width / 2, predictorHeaderY + 24, {',
      "      font: font(10, true),",
      '      fill: "#31e981",',
      '      align: "center",',
      "    });",
      "  }",
      "",
      '  write(ctx, "AI PREDICTED SCORES", x + width / 2, predictorHeaderY + predictorHeaderHeight + 11, {',
      "    font: font(6.8, true),",
      "    fill: TEAL,",
      '    align: "center",',
      "  });",
      "",
      "  const listTop = y + 101;",
    ].join("\n"),
  );
}

// Replace the repeated per-row logo badge with a simple, explicit predicted-score
// label and the score itself.
const predictionStart = source.indexOf(
  '  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";',
  source.indexOf("function drawFixtureRow"),
);

if (predictionStart < 0) {
  throw new Error("Expected Nights Fixtures prediction block was not found.");
}

const scoreWriteNeedle =
  "  write(ctx, prediction, dividerX + predictorWidth / 2, y + height - 8, {";
const scoreWriteStart = source.indexOf(scoreWriteNeedle, predictionStart);

if (scoreWriteStart >= 0) {
  source =
    source.slice(0, predictionStart) +
    [
      '  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";',
      '  write(ctx, "PREDICTED SCORE", dividerX + predictorWidth / 2, y + height / 2 - 10, {',
      "    font: font(6.5, true),",
      "    fill: TEAL,",
      '    align: "center",',
      "  });",
      "",
    ].join("\n") +
    source.slice(scoreWriteStart);

  source = source.replace(
    scoreWriteNeedle,
    "  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 10, {",
  );
}

// Keep enough width for the score to be immediately readable while preserving
// sensible space for both team names.
source = source.replace("  const predictorWidth = 90;", "  const predictorWidth = 104;");
source = source.replace("  const predictorWidth = 126;", "  const predictorWidth = 104;");

if (
  !source.includes("const predictorHeaderWidth = 150;") ||
  !source.includes('write(ctx, "PREDICTED SCORE"') ||
  source.includes("const badgeWidth = 72;") ||
  source.includes("const badgeWidth = 108;")
) {
  throw new Error("Nights Fixtures predictor column layout was not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Nights Fixtures now shows one large AI Predictor logo per pitch column and clear predicted scores beside each fixture.",
);
