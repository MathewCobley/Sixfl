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
  console.log("Nights Fixtures route not present; skipping logo visibility patch.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

// Give the header logo a solid, print-friendly backing and retain the requested
// rightward offset. This makes the white SIXFL lettering readable on paper.
source = source.replace(
  `  if (logo) {
    const maxWidth = 154;
    const maxHeight = 54;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    ctx.drawImage(logo, MARGIN + 28, 18, logo.width * ratio, logo.height * ratio);
  } else {`,
  `  if (logo) {
    const logoBoxX = MARGIN + 28;
    const logoBoxY = 10;
    const logoBoxWidth = 178;
    const logoBoxHeight = 68;

    roundedRect(ctx, logoBoxX, logoBoxY, logoBoxWidth, logoBoxHeight, 10);
    ctx.fillStyle = "#000000";
    ctx.fill();

    const maxWidth = 158;
    const maxHeight = 48;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const logoWidth = logo.width * ratio;
    const logoHeight = logo.height * ratio;
    ctx.drawImage(
      logo,
      logoBoxX + (logoBoxWidth - logoWidth) / 2,
      logoBoxY + (logoBoxHeight - logoHeight) / 2,
      logoWidth,
      logoHeight,
    );
  } else {`,
);

// Use substantially more of the fixture row for the prediction brand and score.
source = source.replace("  const predictorWidth = 90;", "  const predictorWidth = 126;");
source = source.replace("  const badgeWidth = 72;", "  const badgeWidth = 108;");
source = source.replace("  const badgeHeight = 28;", "  const badgeHeight = 30;");
source = source.replace("  const badgeY = y + 5;", "  const badgeY = y + 4;");

// Slightly increase the fallback label too, so the column remains balanced if
// the image ever fails to load.
source = source.replace(
  '      font: font(6.5, true),\n      fill: "#31e981",',
  '      font: font(8, true),\n      fill: "#31e981",',
);

fs.writeFileSync(routePath, source);
console.log("Improved Nights Fixtures header and AI Predictor logo visibility.");
