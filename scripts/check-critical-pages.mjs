import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`CRITICAL PAGE GUARD FAILED: ${message}`);
    process.exitCode = 1;
  }
}

const homepagePath = "src/app/(public)/page.tsx";
const publicLayoutPath = "src/app/(public)/layout.tsx";
const tvSectionPath = "src/components/home/SixflTvHomepageSection.tsx";
const predictorPath = "src/components/home/HomepageAiPredictorSection.tsx";
const leagueDirectoryPath = "src/components/home/HomepageLeagueDirectory.tsx";
const goalPatchPath = "scripts/apply-goal-of-week.cjs";

const retiredHomepageBridges = [
  "src/components/home/HomepageSixflTvBridge.tsx",
  "src/components/home/HomepageAiPredictorCopyBridge.tsx",
  "src/components/home/HomepageLeagueTypeFocusBridge.tsx",
];

for (const bridge of retiredHomepageBridges) {
  assert(!fs.existsSync(path.join(root, bridge)), `${bridge} must stay retired.`);
}

const homepage = read(homepagePath);
const layout = read(publicLayoutPath);
const tvSection = read(tvSectionPath);
const predictor = read(predictorPath);
const leagueDirectory = read(leagueDirectoryPath);
const goalPatch = read(goalPatchPath);

assert(
  homepage.includes('import SixflTvHomepageSection from "@/components/home/SixflTvHomepageSection";'),
  "Homepage must import SIXFL TV directly.",
);
assert(
  homepage.includes("<SixflTvHomepageSection />"),
  "Homepage must render SIXFL TV directly.",
);
assert(
  homepage.includes("<HomepageAiPredictorSection"),
  "Homepage must render the AI Predictor directly.",
);
assert(
  homepage.includes('import HomepageLeagueDirectory from "@/components/home/HomepageLeagueDirectory";'),
  "Homepage must import the database-driven league directory.",
);
assert(
  homepage.includes("<HomepageLeagueDirectory />"),
  "Homepage must render the database-driven league directory.",
);
assert(
  !homepage.includes("const areaCards ="),
  "Homepage league launches must not return to a hard-coded areaCards list.",
);
assert(
  leagueDirectory.includes('data-testid="homepage-league-directory"'),
  "Homepage league directory critical marker is missing.",
);
assert(
  leagueDirectory.includes("getHomepageLeagues()"),
  "Homepage league directory must read current launch leagues from the database.",
);
assert(
  homepage.includes('data-testid="homepage-hero"'),
  "Homepage hero critical marker is missing.",
);
assert(
  tvSection.includes('data-testid="homepage-sixfl-tv"'),
  "SIXFL TV critical marker is missing.",
);
assert(
  predictor.includes('data-testid="homepage-ai-predictor"'),
  "AI Predictor critical marker is missing.",
);
assert(
  tvSection.includes('import sixflTvLogo from "../../../public/Sixfl-tv.png";'),
  "SIXFL TV logo must be bundled through a static import.",
);
assert(
  predictor.includes('import predictorLogo from "../../../public/logos/sixfl-ai-predictor.png";'),
  "AI Predictor logo must be bundled through a static import.",
);
assert(
  tvSection.includes("<HomepageSixflTvLatestLinks />"),
  "Homepage must keep the latest SIXFL TV links surface.",
);
assert(
  tvSection.includes("<GoalOfWeekHomepageFeature"),
  "Homepage must keep Goal of the Week inside SIXFL TV.",
);

for (const retiredName of [
  "HomepageSixflTvBridge",
  "HomepageAiPredictorCopyBridge",
  "HomepageLeagueTypeFocusBridge",
]) {
  assert(!layout.includes(retiredName), `${retiredName} must not be mounted from the public layout.`);
}

assert(
  !goalPatch.includes("src/components/home/SixflTvHomepageSection.tsx"),
  "Goal of the Week build patch must not rewrite the homepage SIXFL TV component.",
);
assert(
  !goalPatch.includes("patchHomepageSection"),
  "Goal of the Week build patch must remain admin-only.",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("Critical page source guard passed.");