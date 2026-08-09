const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, patcher) {
  const absolutePath = path.join(root, relativePath);
  const current = fs.readFileSync(absolutePath, "utf8");
  const next = patcher(current);
  fs.writeFileSync(absolutePath, next, "utf8");
}

function replaceIfPresent(source, before, after) {
  return source.includes(before) ? source.replace(before, after) : source;
}

patchFile(
  "src/components/captain/CaptainMatchdayAvailabilityBadgesBridge.tsx",
  (input) => {
    let source = input;

    const oldEffectStart = [
      "  useEffect(() => {",
      "    let cancelled = false;",
      "    const teamId = getTeamIdFromPathname(pathname);",
      "",
      "    function runCopyRewrite() {",
      "      if (!cancelled) rewriteCaptainFriendlyCopy();",
      "    }",
      "",
      "    runCopyRewrite();",
      "",
      '    const root = document.querySelector(".captain-team-shell") ?? document.body;',
      "    const observer = new MutationObserver(runCopyRewrite);",
      "    observer.observe(root, { childList: true, subtree: true, characterData: true });",
      "",
      "    async function loadAvailability() {",
      "      if (!teamId || !fixtureId) return;",
    ].join("\n");

    const newEffectStart = [
      "  useEffect(() => {",
      "    const teamId = getTeamIdFromPathname(pathname);",
      "    if (!teamId) return;",
      "",
      "    let cancelled = false;",
      "    rewriteCaptainFriendlyCopy();",
      "",
      "    async function loadAvailability() {",
      "      if (!fixtureId) return;",
    ].join("\n");

    source = replaceIfPresent(source, oldEffectStart, newEffectStart);

    source = replaceIfPresent(
      source,
      [
        "    return () => {",
        "      cancelled = true;",
        "      observer.disconnect();",
        "      window.cancelAnimationFrame(frame);",
        "    };",
      ].join("\n"),
      [
        "    return () => {",
        "      cancelled = true;",
        "      window.cancelAnimationFrame(frame);",
        "    };",
      ].join("\n"),
    );

    return source;
  },
);

patchFile(
  "src/components/captain/CaptainFixtureBadgesBridge.tsx",
  (input) =>
    input.replace(
      '    `/captain/team/${teamId}/player-payments`,\n',
      "",
    ),
);

// TeamAutoPayCopyBridge used to rewrite the player-payment summary after React
// rendered it. That allowed an open player link to overwrite the real fixture
// balance and incorrectly claim that a fixture was covered. The bridge is now
// removed completely: both payment pages must render their own state natively.
require("./apply-native-team-payment-copy.cjs");

const routeScopedPath = path.join(root, "src/components/RouteScopedBridges.tsx");
const routeScopedSource = fs.readFileSync(routeScopedPath, "utf8");
const retiredPaymentBridgePath = path.join(
  root,
  "src/components/captain/TeamAutoPayCopyBridge.tsx",
);
const playerPaymentPage = fs.readFileSync(
  path.join(
    root,
    "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx",
  ),
  "utf8",
);
const teamPaymentPage = fs.readFileSync(
  path.join(root, "src/app/captain/team/[teamid]/payments/page.tsx"),
  "utf8",
);
const availabilitySource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainMatchdayAvailabilityBadgesBridge.tsx"),
  "utf8",
);
const fixtureBadgeSource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainFixtureBadgesBridge.tsx"),
  "utf8",
);

if (
  fs.existsSync(retiredPaymentBridgePath) ||
  routeScopedSource.includes("TeamAutoPayCopyBridge") ||
  !playerPaymentPage.includes("The team balance remaining is") ||
  !playerPaymentPage.includes("playerOutstandingPence") ||
  !teamPaymentPage.includes("Saved card matchday payments") ||
  availabilitySource.includes("new MutationObserver(runCopyRewrite)") ||
  fixtureBadgeSource.includes('`/captain/team/${teamId}/player-payments`,')
) {
  throw new Error(
    "Payment pages are not fully protected from the retired DOM payment bridge.",
  );
}

console.log(
  "Captain payment pages now use native React payment state; the old DOM payment copy bridge is gone.",
);
