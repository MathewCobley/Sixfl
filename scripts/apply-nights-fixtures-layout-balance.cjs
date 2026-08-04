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

// Pitch 2's direction arrow previously ran underneath the predictor box. Move
// it left and leave a deliberate gap before the score-column header.
source = source.replace(
  "    drawArrow(ctx, x + width - arrowWidth - 4, y + 2, arrowWidth, arrowHeight, \"right\");",
  "    drawArrow(ctx, x + width - arrowWidth - 126, y + 2, arrowWidth, arrowHeight, \"right\");",
);

if (
  !source.includes("const timeWidth = 52;") ||
  !source.includes("const predictorWidth = 96;") ||
  !source.includes("const predictorHeaderWidth = 116;") ||
  !source.includes("const logoPadding = 6;") ||
  !source.includes("x + width - arrowWidth - 126")
) {
  throw new Error("Nights Fixtures layout balance was not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Nights Fixtures now has a neatly inset Predictor logo, wider team-name area and a clear gap before the right pitch arrow.",
);
