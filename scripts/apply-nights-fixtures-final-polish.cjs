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
  console.log("Nights Fixtures route not present; skipping final predictor polish.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

// Use the actual predictor artwork already used by the website rather than the
// temporary embedded image added by an older PDF patch.
source = source.replace(
  /predictorLogo = await loadImage\(Buffer\.from\([\s\S]*?, "base64"\)\);/,
  'predictorLogo = await loadImage(path.join(process.cwd(), "public", "logos", "sixfl-ai-predictor.png"));',
);

// Prefer the real predictor artwork over the standard SIXFL brand logo.
source = source.replace(
  "  const headerLogo = brandLogo ?? predictorLogo;",
  "  const headerLogo = predictorLogo ?? brandLogo;",
);

// Let the official predictor logo fill its black header box properly.
source = source.replace(
  "    const maxLogoWidth = predictorHeaderWidth - 12;",
  "    const maxLogoWidth = predictorHeaderWidth - 4;",
);
source = source.replace(
  "    const maxLogoHeight = 36;",
  "    const maxLogoHeight = predictorHeaderHeight - 4;",
);
source = source.replace(
  "      predictorHeaderY + 5,",
  "      predictorHeaderY + (predictorHeaderHeight - headerLogoHeight) / 2,",
);

// The official artwork already says AI Predictor, so remove the duplicate label
// inside the box and the second 'AI predicted scores' line below it.
source = source.replace(
  /\n  write\(ctx, "AI PREDICTOR", predictorHeaderX \+ predictorHeaderWidth \/ 2, predictorHeaderY \+ 51, \{[\s\S]*?\n  \}\);/,
  "",
);
source = source.replace(
  /\n  write\(ctx, "AI PREDICTED SCORES", predictorHeaderX \+ predictorHeaderWidth \/ 2, predictorHeaderY \+ predictorHeaderHeight \+ 11, \{[\s\S]*?\n  \}\);/,
  "",
);
source = source.replace("  const listTop = y + 108;", "  const listTop = y + 101;");

// Centre each team name vertically against its own badge.
source = source.replace(
  "  write(ctx, fit(ctx, fixture.homeTeam.name, teamTextWidth), teamTextX, y + height / 2 - 10, {\n    font: font(11.5, true),\n  });",
  "  write(ctx, fit(ctx, fixture.homeTeam.name, teamTextWidth), teamTextX, homeBadgeY + badgeSize / 2, {\n    font: font(11.5, true),\n    baseline: \"middle\",\n  });",
);
source = source.replace(
  "  write(ctx, fit(ctx, fixture.awayTeam.name, teamTextWidth), teamTextX, y + height / 2 + 17, {\n    font: font(11.5, true),\n  });",
  "  write(ctx, fit(ctx, fixture.awayTeam.name, teamTextWidth), teamTextX, awayBadgeY + badgeSize / 2, {\n    font: font(11.5, true),\n    baseline: \"middle\",\n  });",
);

if (
  !source.includes('"logos", "sixfl-ai-predictor.png"') ||
  !source.includes("const headerLogo = predictorLogo ?? brandLogo;") ||
  source.includes('write(ctx, "AI PREDICTED SCORES"') ||
  !source.includes("homeBadgeY + badgeSize / 2") ||
  !source.includes("awayBadgeY + badgeSize / 2")
) {
  throw new Error("Nights Fixtures final predictor polish was not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log(
  "Nights Fixtures now uses the official AI Predictor artwork, removes duplicate predictor copy and centres team names beside their badges.",
);
