import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.CRITICAL_PAGES_BASE_URL || "http://127.0.0.1:3000";
const artifactDir = path.resolve("artifacts/critical-pages");
fs.mkdirSync(artifactDir, { recursive: true });

function fail(message) {
  throw new Error(`Homepage critical check failed: ${message}`);
}

async function assertSubstantialBox(locator, label, minHeight = 220) {
  const box = await locator.boundingBox();
  if (!box || box.width < 280 || box.height < minHeight) {
    fail(`${label} collapsed or disappeared (${JSON.stringify(box)}).`);
  }
}

async function waitForImagesToSettle(page) {
  const images = page.locator("img");
  const count = await images.count();

  // Force legitimate lazy-loaded images (for example the footer logo) into
  // view before deciding whether an image is actually broken.
  for (let index = 0; index < count; index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
  }

  await images.evaluateAll(async (elements) => {
    await Promise.all(
      elements.map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            const finish = () => resolve();
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
            setTimeout(finish, 5_000);
          }),
      ),
    );
  });
}

async function assertHomepage(page, label) {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  const response = await page.goto(`${baseUrl}/`, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });

  if (!response || !response.ok()) {
    fail(`${label} homepage returned ${response?.status() ?? "no response"}.`);
  }

  const hero = page.getByTestId("homepage-hero");
  const directory = page.getByTestId("homepage-league-directory");
  const tv = page.getByTestId("homepage-sixfl-tv");
  const predictor = page.getByTestId("homepage-ai-predictor");

  await hero.waitFor({ state: "visible" });
  await directory.waitFor({ state: "attached" });
  await tv.waitFor({ state: "visible" });
  await predictor.waitFor({ state: "visible" });

  await assertSubstantialBox(hero, `${label} homepage hero`, 420);
  await assertSubstantialBox(tv, `${label} SIXFL TV`, 360);
  await assertSubstantialBox(predictor, `${label} AI Predictor`, 360);

  await page.getByRole("heading", {
    level: 1,
    name: /Local 6-a-side football\./i,
  }).waitFor({ state: "visible" });
  await page.getByText(
    /Find your league — or help build the next one\./i,
  ).waitFor({ state: "visible" });
  await page.getByRole("heading", {
    name: /Watch the Goal of the Week and every SIXFL highlight/i,
  }).waitFor({ state: "visible" });
  await page.getByRole("heading", {
    name: /Match predictions, powered by SIXFL AI Predictor/i,
  }).waitFor({ state: "visible" });

  // The league directory is database-backed. This critical-page workflow
  // deliberately runs with an unavailable database, so verify the stable
  // homepage entry points rather than requiring a fixed number of live cards.
  await page.getByRole("link", { name: /VIEW LIVE LEAGUES/i }).waitFor({
    state: "visible",
  });
  await page.getByRole("link", { name: /NEW LEAGUES FORMING/i }).waitFor({
    state: "visible",
  });
  await page.getByRole("link", { name: "REGISTER", exact: true }).waitFor({
    state: "visible",
  });

  const tvBeforePredictor = await page.evaluate(() => {
    const tvSection = document.querySelector('[data-testid="homepage-sixfl-tv"]');
    const aiSection = document.querySelector('[data-testid="homepage-ai-predictor"]');
    if (!tvSection || !aiSection) return false;
    return Boolean(
      tvSection.compareDocumentPosition(aiSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  if (!tvBeforePredictor) fail(`${label} SIXFL TV is no longer before the AI Predictor.`);

  const tvLink = page.getByRole("link", { name: /WATCH SIXFL TV/i }).first();
  const tvHref = await tvLink.getAttribute("href");
  if (!tvHref?.includes("youtube.com")) fail(`${label} SIXFL TV channel link is missing.`);

  await waitForImagesToSettle(page);

  const brokenImages = await page.locator("img").evaluateAll((elements) =>
    elements
      .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => ({ alt: image.alt, src: image.currentSrc || image.src })),
  );
  if (brokenImages.length) {
    fail(`${label} contains broken images: ${JSON.stringify(brokenImages)}`);
  }

  for (const alt of ["SIXFL TV", "SIXFL AI Predictor"]) {
    const logo = page.getByAltText(alt).first();
    await logo.waitFor({ state: "visible" });
    const loaded = await logo.evaluate(
      (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
    );
    if (!loaded) fail(`${label} ${alt} brand image did not load.`);

    const box = await logo.boundingBox();
    if (!box || box.width < 120 || box.height < 35) {
      fail(`${label} ${alt} brand image collapsed (${JSON.stringify(box)}).`);
    }
  }

  const mainLogo = page.getByAltText("SIXFL").first();
  await mainLogo.waitFor({ state: "visible" });
  const mainLogoLoaded = await mainLogo.evaluate(
    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  );
  if (!mainLogoLoaded) fail(`${label} main SIXFL header logo did not load.`);

  if (browserErrors.length) {
    fail(`${label} emitted browser errors: ${browserErrors.join(" | ")}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await assertHomepage(desktop, "desktop");
  await desktop.screenshot({
    path: path.join(artifactDir, "homepage-desktop.png"),
    fullPage: true,
  });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await assertHomepage(mobile, "mobile");
  await mobile.screenshot({
    path: path.join(artifactDir, "homepage-mobile.png"),
    fullPage: true,
  });
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Homepage critical browser checks passed on desktop and mobile.");