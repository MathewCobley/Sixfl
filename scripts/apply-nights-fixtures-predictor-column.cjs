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

function addFunctionParameter(functionName, parameterLine) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${functionName}().`);

  const close = source.indexOf("\n) {", start);
  if (close < 0) throw new Error(`Could not find the end of ${functionName}() parameters.`);

  const signature = source.slice(start, close);
  if (signature.includes(parameterLine.trim())) return;

  const previousLineStart = source.lastIndexOf("\n", close - 1) + 1;
  const previousLine = source.slice(previousLineStart, close);
  const indent = previousLine.match(/^\s*/)?.[0] ?? "  ";
  source = `${source.slice(0, close)}\n${indent}${parameterLine.trim()}${source.slice(close)}`;
}

function findClosingParen(openParen) {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function addCallArgument(callName, argument, expectedCount) {
  let cursor = 0;
  let found = 0;

  while (cursor < source.length) {
    const marker = `${callName}(`;
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;

    const prefix = source.slice(Math.max(0, start - 12), start);
    cursor = start + marker.length;
    if (prefix.endsWith("function ")) continue;

    const openParen = start + callName.length;
    const closeParen = findClosingParen(openParen);
    if (closeParen < 0) throw new Error(`Could not parse ${callName}() call.`);

    const callText = source.slice(start, closeParen);
    found += 1;
    if (!callText.includes(argument)) {
      const closeLineStart = source.lastIndexOf("\n", closeParen - 1) + 1;
      const previousLineStart = source.lastIndexOf("\n", closeLineStart - 2) + 1;
      const previousLine = source.slice(previousLineStart, closeLineStart - 1);
      const argumentIndent = previousLine.match(/^\s*/)?.[0] ?? "    ";
      source = `${source.slice(0, closeLineStart)}${argumentIndent}${argument},\n${source.slice(closeLineStart)}`;
      cursor = closeParen + argument.length + argumentIndent.length + 2;
    } else {
      cursor = closeParen + 1;
    }
  }

  if (found < expectedCount) {
    throw new Error(`Expected at least ${expectedCount} ${callName}() call(s), found ${found}.`);
  }
}

// Give the main SIXFL header logo a solid print-friendly backing.
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

addFunctionParameter("drawPitchColumn", "brandLogo: Image | null,");
addCallArgument("drawPitchColumn", "logo", 2);

const pitchColumnStart = source.indexOf("function drawPitchColumn(");
const headingStart = source.indexOf(
  "  drawPitchHeading(ctx, x + 12, y + 8, width - 24, pitch);",
  pitchColumnStart,
);
const listBottomStart = source.indexOf("  const listBottom =", headingStart);

if (pitchColumnStart < 0 || headingStart < 0 || listBottomStart < 0) {
  throw new Error("Expected Nights Fixtures pitch-column header block was not found.");
}

const headerBlock = `  drawPitchHeading(ctx, x + 12, y + 8, width - 24, pitch);

  const predictorHeaderWidth = 120;
  const predictorHeaderHeight = 58;
  const predictorHeaderX = x + width - predictorHeaderWidth - 12;
  const predictorHeaderY = y + 39;

  roundedRect(
    ctx,
    predictorHeaderX,
    predictorHeaderY,
    predictorHeaderWidth,
    predictorHeaderHeight,
    9,
  );
  ctx.fillStyle = "#000000";
  ctx.fill();

  const headerLogo = brandLogo ?? predictorLogo;
  if (headerLogo) {
    const maxLogoWidth = predictorHeaderWidth - 12;
    const maxLogoHeight = 36;
    const logoRatio = Math.min(
      maxLogoWidth / headerLogo.width,
      maxLogoHeight / headerLogo.height,
    );
    const headerLogoWidth = headerLogo.width * logoRatio;
    const headerLogoHeight = headerLogo.height * logoRatio;
    ctx.drawImage(
      headerLogo,
      predictorHeaderX + (predictorHeaderWidth - headerLogoWidth) / 2,
      predictorHeaderY + 5,
      headerLogoWidth,
      headerLogoHeight,
    );
  } else {
    write(ctx, "SIXFL", predictorHeaderX + predictorHeaderWidth / 2, predictorHeaderY + 30, {
      font: font(22, true),
      fill: "#ffffff",
      align: "center",
    });
  }

  write(ctx, "AI PREDICTOR", predictorHeaderX + predictorHeaderWidth / 2, predictorHeaderY + 51, {
    font: font(8.5, true),
    fill: "#31e981",
    align: "center",
  });
  write(ctx, "AI PREDICTED SCORES", predictorHeaderX + predictorHeaderWidth / 2, predictorHeaderY + predictorHeaderHeight + 11, {
    font: font(6.8, true),
    fill: TEAL,
    align: "center",
  });

  const listTop = y + 108;
`;

source = `${source.slice(0, headingStart)}${headerBlock}${source.slice(listBottomStart)}`;

// Make the score column line up exactly beneath its predictor header.
source = source.replace(/  const predictorWidth = (?:90|104|120|126);/, "  const predictorWidth = 120;");

const fixtureRowStart = source.indexOf("function drawFixtureRow(");
const predictionStart = source.indexOf(
  '  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";',
  fixtureRowStart,
);
const fixtureRowEnd = source.indexOf("\n}\n\nfunction drawPitchColumn", predictionStart);

if (fixtureRowStart < 0 || predictionStart < 0 || fixtureRowEnd < 0) {
  throw new Error("Expected Nights Fixtures fixture prediction block was not found.");
}

const predictionBlock = `  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";
  write(ctx, "PREDICTED SCORE", dividerX + predictorWidth / 2, y + height / 2 - 11, {
    font: font(6.8, true),
    fill: TEAL,
    align: "center",
  });
  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 13, {
    font: font(prediction.length > 10 ? 11 : 20, true),
    align: "center",
  });`;

source = `${source.slice(0, predictionStart)}${predictionBlock}${source.slice(fixtureRowEnd)}`;

if (
  !source.includes("const predictorHeaderX = x + width - predictorHeaderWidth - 12;") ||
  !source.includes("const predictorHeaderWidth = 120;") ||
  !source.includes("brandLogo: Image | null") ||
  !source.includes('write(ctx, "PREDICTED SCORE"')
) {
  throw new Error("Nights Fixtures predictor alignment was not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Nights Fixtures now aligns a large predictor brand above the score column and keeps scores clearly labelled.",
);
