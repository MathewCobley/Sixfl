const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, patcher) {
  const absolutePath = path.join(root, relativePath);
  const current = fs.readFileSync(absolutePath, "utf8");
  const next = patcher(current);
  fs.writeFileSync(absolutePath, next, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
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

    source = replaceRequired(
      source,
      oldEffectStart,
      newEffectStart,
      "matchday availability route guard and observer removal",
    );

    source = replaceRequired(
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
      "matchday availability observer cleanup removal",
    );

    return source;
  },
);

patchFile(
  "src/components/captain/CaptainFixtureBadgesBridge.tsx",
  (input) => {
    let source = input;

    source = replaceRequired(
      source,
      [
        "    `/captain/team/${teamId}/fixtures`,",
        "    `/captain/team/${teamId}/results`,",
        "    `/captain/team/${teamId}/player-payments`,",
        "    `/captain/team/${teamId}/match-fees`,",
      ].join("\n"),
      [
        "    `/captain/team/${teamId}/fixtures`,",
        "    `/captain/team/${teamId}/results`,",
        "    `/captain/team/${teamId}/match-fees`,",
      ].join("\n"),
      "player-payments fixture badge exclusion",
    );

    return source;
  },
);

patchFile("src/components/captain/TeamAutoPayCopyBridge.tsx", (input) => {
  let source = input;

  const oldEffect = [
    "  useEffect(() => {",
    "    const params = new URLSearchParams(searchParams.toString());",
    '    const isTeamPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/payments\\/?$/.test(pathname);',
    '    const isSquadPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/player-payments\\/?$/.test(pathname);',
    "",
    "    if (!isTeamPaymentsPage && !isSquadPaymentsPage) return;",
    "",
    "    const apply = () => {",
    "      if (isTeamPaymentsPage) {",
    '        updatePaymentCopy(params.get("autopay"));',
    "      }",
    "      if (isSquadPaymentsPage) {",
    "        updateSquadPaymentClarity(params);",
    "      }",
    "    };",
    "",
    "    apply();",
    "    const observer = new MutationObserver(apply);",
    "    observer.observe(document.body, { childList: true, subtree: true });",
    "",
    "    return () => observer.disconnect();",
    "  }, [pathname, searchParams]);",
  ].join("\n");

  const newEffect = [
    "  useEffect(() => {",
    "    const params = new URLSearchParams(searchParams.toString());",
    '    const isTeamPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/payments\\/?$/.test(pathname);',
    '    const isSquadPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/player-payments\\/?$/.test(pathname);',
    "",
    "    if (!isTeamPaymentsPage && !isSquadPaymentsPage) return;",
    "",
    "    const apply = () => {",
    "      if (isTeamPaymentsPage) {",
    '        updatePaymentCopy(params.get("autopay"));',
    "      }",
    "      if (isSquadPaymentsPage) {",
    "        updateSquadPaymentClarity(params);",
    "      }",
    "    };",
    "",
    "    if (isSquadPaymentsPage) {",
    "      const frame = window.requestAnimationFrame(apply);",
    "      const timer = window.setTimeout(apply, 250);",
    "",
    "      return () => {",
    "        window.cancelAnimationFrame(frame);",
    "        window.clearTimeout(timer);",
    "      };",
    "    }",
    "",
    "    apply();",
    "    const observer = new MutationObserver(apply);",
    "    observer.observe(document.body, { childList: true, subtree: true });",
    "",
    "    return () => observer.disconnect();",
    "  }, [pathname, searchParams]);",
  ].join("\n");

  source = replaceRequired(
    source,
    oldEffect,
    newEffect,
    "squad payment observer removal",
  );

  return source;
});

const availabilitySource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainMatchdayAvailabilityBadgesBridge.tsx"),
  "utf8",
);
const fixtureBadgeSource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainFixtureBadgesBridge.tsx"),
  "utf8",
);
const autoPaySource = fs.readFileSync(
  path.join(root, "src/components/captain/TeamAutoPayCopyBridge.tsx"),
  "utf8",
);

if (
  !availabilitySource.includes("if (!teamId) return;") ||
  availabilitySource.includes("new MutationObserver(runCopyRewrite)") ||
  availabilitySource.includes("characterData: true") ||
  fixtureBadgeSource.includes('`/captain/team/${teamId}/player-payments`,') ||
  !autoPaySource.includes("if (isSquadPaymentsPage) {") ||
  !autoPaySource.includes("const timer = window.setTimeout(apply, 250);")
) {
  throw new Error("Squad payments freeze fix did not apply correctly.");
}

console.log(
  "Squad payments no longer runs full-page mutation observers or the fixture AI badge injector.",
);
