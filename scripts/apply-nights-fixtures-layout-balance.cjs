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
  console.log("Nights Fixtures route not present; skipping layout balance.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

// Give team names more horizontal room by tightening the time and prediction
// columns. The prediction remains clear but no longer dominates each fixture.
source = source.replace(/  const timeWidth = (?:52|62);/, "  const timeWidth = 52;");
source = source.replace(/  const predictorWidth = (?:90|96|104|120|126);/, "  const predictorWidth = 96;");
source = source.replace(
  /    font: font\(16, true\),\n    fill: DARK,\n    align: "center",\n    baseline: "middle",/,
  '    font: font(14.5, true),\n    fill: DARK,\n    align: "center",\n    baseline: "middle",',
);
source = source.replace(
  /    font: font\(prediction\.length > 10 \? 11 : (?:18|20), true\),/,
  "    font: font(prediction.length > 10 ? 10 : 18, true),",
);
source = source.replace(
  /    font: font\((?:6\.5|6\.8), true\),\n    fill: TEAL,\n    align: "center",\n  \}\);\n  write\(ctx, prediction/,
  '    font: font(6.2, true),\n    fill: TEAL,\n    align: "center",\n  });\n  write(ctx, prediction',
);

// Align the predictor box directly over the narrower score column. It is taller
// and uses a cropped draw so the real logo artwork remains clear and prominent.
source = source.replace(
  /  const predictorHeaderWidth = (?:112|116|120|150);\n  const predictorHeaderHeight = (?:38|58|68);\n  const predictorHeaderX = [^;]+;\n  const predictorHeaderY = y \+ \d+;/,
  [
    "  const scoreColumnWidth = 96;",
    "  const predictorHeaderWidth = 116;",
    "  const predictorHeaderHeight = 68;",
    "  const scoreColumnRight = x + width - 12;",
    "  const predictorHeaderX =",
    "    scoreColumnRight - scoreColumnWidth / 2 - predictorHeaderWidth / 2;",
    "  const predictorHeaderY = y + 31;",
  ].join("\n"),
);

const logoBlockPattern = /  const headerLogo = predictorLogo \?\? brandLogo;\n  if \(headerLogo\) \{[\s\S]*?\n  \} else \{/;
if (!logoBlockPattern.test(source)) {
  throw new Error("Expected Nights Fixtures predictor logo drawing block was not found.");
}

source = source.replace(
  logoBlockPattern,
  `  const headerLogo = predictorLogo ?? brandLogo;
  if (headerLogo) {
    const logoPadding = 6;
    const destinationX = predictorHeaderX + logoPadding;
    const destinationY = predictorHeaderY + logoPadding;
    const destinationWidth = predictorHeaderWidth - logoPadding * 2;
    const destinationHeight = predictorHeaderHeight - logoPadding * 2;

    // The official PNG has generous design-canvas margins. Crop those first,
    // then scale it inside the inset area so the mark fits comfortably in its box.
    const initialX = headerLogo.width * 0.08;
    const initialY = headerLogo.height * 0.18;
    const initialWidth = headerLogo.width * 0.84;
    const initialHeight = headerLogo.height * 0.64;
    const sourceAspect = initialWidth / initialHeight;
    const destinationAspect = destinationWidth / destinationHeight;
    let cropX = initialX;
    let cropY = initialY;
    let cropWidth = initialWidth;
    let cropHeight = initialHeight;

    if (sourceAspect > destinationAspect) {
      cropWidth = initialHeight * destinationAspect;
      cropX = initialX + (initialWidth - cropWidth) / 2;
    } else {
      cropHeight = initialWidth / destinationAspect;
      cropY = initialY + (initialHeight - cropHeight) / 2;
    }

    ctx.drawImage(
      headerLogo,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );
  } else {`,
);

// Use the same short, chunky arrow position in both pitch columns. Only the
// direction changes. Centre the pitch label on the arrow itself rather than on
// the whole column, which prevents Pitch 2 drifting towards the predictor box.
const balancedArrowBlock = [
  "  const arrowWidth = 165;",
  "  const arrowHeight = 48;",
  "  const arrowX = x + 8;",
  "  drawArrow(",
  "    ctx,",
  "    arrowX,",
  "    y,",
  "    arrowWidth,",
  "    arrowHeight,",
  '    pitch === 1 ? "left" : "right",',
  "  );",
  "  write(ctx, `PITCH ${pitch}`, arrowX + arrowWidth / 2, y + arrowHeight / 2 + 1, {",
  "    font: font(20, true),",
  '    fill: "#ffffff",',
  '    align: "center",',
  '    baseline: "middle",',
  "  });",
].join("\n");

if (!source.includes("const arrowWidth = 165;")) {
  const previousBalancedPattern = /  const arrowWidth = Math\.min\(220, width - 132\);\n  const arrowHeight = 42;\n  const arrowX = x \+ 4;\n  drawArrow\(\n    ctx,\n    arrowX,\n    y,\n    arrowWidth,\n    arrowHeight,\n    pitch === 1 \? "left" : "right",\n  \);\n  write\(ctx, `PITCH \$\{pitch\}`, x \+ width \/ 2, y \+ arrowHeight \/ 2 \+ 1, \{\n    font: font\(22, true\),\n    fill: "#ffffff",\n    align: "center",\n    baseline: "middle",\n  \}\);/;
  const originalHeadingPattern = /  const arrowWidth = 82;\n  const arrowHeight = 34;\n  if \(pitch === 1\) \{\n    drawArrow\(ctx, x \+ 4, y \+ 2, arrowWidth, arrowHeight, "left"\);\n  \} else \{\n    drawArrow\(ctx, x \+ width - arrowWidth - (?:4|126), y \+ 2, arrowWidth, arrowHeight, "right"\);\n  \}\n  write\(ctx, `PITCH \$\{pitch\}`, x \+ width \/ 2, y \+ 30, \{\n    font: font\(23, true\),\n    align: "center",\n  \}\);/;

  if (previousBalancedPattern.test(source)) {
    source = source.replace(previousBalancedPattern, balancedArrowBlock);
  } else if (originalHeadingPattern.test(source)) {
    source = source.replace(originalHeadingPattern, balancedArrowBlock);
  } else {
    throw new Error("Expected Nights Fixtures pitch-arrow heading block was not found.");
  }
}

if (
  !source.includes("const timeWidth = 52;") ||
  !source.includes("const predictorWidth = 96;") ||
  !source.includes("const predictorHeaderWidth = 116;") ||
  !source.includes("const logoPadding = 6;") ||
  !source.includes("const arrowWidth = 165;") ||
  !source.includes("const arrowHeight = 48;") ||
  !source.includes("arrowX + arrowWidth / 2") ||
  !source.includes('pitch === 1 ? "left" : "right"')
) {
  throw new Error("Nights Fixtures layout balance was not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Nights Fixtures now has matching short, thick pitch arrows with each pitch label centred on its arrow.",
);
