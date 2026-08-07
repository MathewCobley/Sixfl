const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, patcher) {
  const absolutePath = path.join(root, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const next = patcher(source);
  fs.writeFileSync(absolutePath, next, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

patchFile("src/components/captain/AdminPlayerPreviewLinks.tsx", (input) => {
  let source = input;

  source = replaceRequired(
    source,
    [
      "  useEffect(() => {",
      "    const teamId = getTeamIdFromPathname(pathname);",
      "    let cancelled = false;",
    ].join("\n"),
    [
      "  useEffect(() => {",
      "    const teamId = getTeamIdFromPathname(pathname);",
      "    if (!teamId) return;",
      "",
      "    let cancelled = false;",
    ].join("\n"),
    "admin player preview route guard",
  );

  source = replaceRequired(
    source,
    [
      "    if (teamId) {",
      "      fetch(`/api/admin/team/${teamId}/squad-login-status`, { cache: \"no-store\" })",
      "        .then(async (response) => {",
      "          if (!response.ok) throw new Error(\"Could not load login status.\");",
      "          return (await response.json()) as LoginStatusPayload;",
      "        })",
      "        .then((payload) => {",
      "          if (cancelled) return;",
      "          statusByMembershipId = new Map(",
      "            payload.items.map((item) => [item.membershipId, item]),",
      "          );",
      "          runSafely();",
      "        })",
      "        .catch(() => {",
      "          if (!cancelled) runSafely();",
      "        });",
      "    }",
    ].join("\n"),
    [
      "    fetch(`/api/admin/team/${teamId}/squad-login-status`, { cache: \"no-store\" })",
      "      .then(async (response) => {",
      "        if (!response.ok) throw new Error(\"Could not load login status.\");",
      "        return (await response.json()) as LoginStatusPayload;",
      "      })",
      "      .then((payload) => {",
      "        if (cancelled) return;",
      "        statusByMembershipId = new Map(",
      "          payload.items.map((item) => [item.membershipId, item]),",
      "        );",
      "        runSafely();",
      "      })",
      "      .catch(() => {",
      "        if (!cancelled) runSafely();",
      "      });",
    ].join("\n"),
    "admin player preview guarded fetch",
  );

  return source;
});

patchFile("src/components/captain/CaptainViewModeHeader.tsx", (input) => {
  // Newer captain preview code deliberately avoids MutationObserver entirely.
  // A handful of bounded rewrites is safer because this component itself changes
  // text nodes; observing the same subtree can trigger repeated render/mutation work.
  if (input.includes("const delays = [0, 100, 300, 700, 1400];")) {
    return input;
  }

  const modernBefore = [
    "  useEffect(() => {",
    "    if (!shouldRewriteCaptainFacingText) return;",
    "",
    "    const root = document.querySelector(\".captain-team-shell\") ?? document.body;",
    "    const frame = window.requestAnimationFrame(rewriteCaptainFacingText);",
    "    const observer = new MutationObserver(rewriteCaptainFacingText);",
    "",
    "    observer.observe(root, { childList: true, subtree: true, characterData: true });",
    "",
    "    return () => {",
    "      window.cancelAnimationFrame(frame);",
    "      observer.disconnect();",
    "    };",
    "  }, [pathname, searchParamsKey, shouldRewriteCaptainFacingText]);",
  ].join("\n");

  const modernAfter = [
    "  useEffect(() => {",
    "    if (!shouldRewriteCaptainFacingText) return;",
    "",
    "    let cancelled = false;",
    "    const timers: number[] = [];",
    "    const delays = [0, 100, 300, 700, 1400];",
    "",
    "    for (const delay of delays) {",
    "      const timer = window.setTimeout(() => {",
    "        if (!cancelled) rewriteCaptainFacingText();",
    "      }, delay);",
    "      timers.push(timer);",
    "    }",
    "",
    "    return () => {",
    "      cancelled = true;",
    "      for (const timer of timers) window.clearTimeout(timer);",
    "    };",
    "  }, [pathname, searchParamsKey, shouldRewriteCaptainFacingText]);",
  ].join("\n");

  if (input.includes(modernBefore)) return input.replace(modernBefore, modernAfter);
  throw new Error("Expected captain text rewrite source was not found.");
});

patchFile("src/components/captain/CaptainOnboardingReminderBridge.tsx", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    [
      "    syncCaptainDecorations();",
      "    const frame = window.requestAnimationFrame(syncCaptainDecorations);",
      "    const observer = new MutationObserver(syncCaptainDecorations);",
      "    const shell = document.querySelector(\".captain-team-shell\");",
      "    if (shell) {",
      "      observer.observe(shell, {",
      "        childList: true,",
      "        subtree: true,",
      "        attributes: true,",
      "      });",
      "    }",
    ].join("\n"),
    [
      "    syncCaptainDecorations();",
      "    const frame = window.requestAnimationFrame(syncCaptainDecorations);",
      "    const observer = new MutationObserver(syncCaptainDecorations);",
      "    const nav = document.querySelector(\".captain-team-nav\");",
      "    if (nav) {",
      "      observer.observe(nav, {",
      "        childList: true,",
      "        subtree: true,",
      "      });",
      "    }",
    ].join("\n"),
    "captain onboarding observer scope",
  );
  return source;
});

const previewSource = fs.readFileSync(path.join(root, "src/components/captain/AdminPlayerPreviewLinks.tsx"), "utf8");
const headerSource = fs.readFileSync(path.join(root, "src/components/captain/CaptainViewModeHeader.tsx"), "utf8");
const reminderSource = fs.readFileSync(path.join(root, "src/components/captain/CaptainOnboardingReminderBridge.tsx"), "utf8");

if (
  !previewSource.includes("if (!teamId) return;") ||
  headerSource.includes("characterData: true") ||
  headerSource.includes("new MutationObserver(rewriteCaptainFacingText)") ||
  !headerSource.includes("const delays = [0, 100, 300, 700, 1400];") ||
  reminderSource.includes("attributes: true") ||
  !reminderSource.includes('const nav = document.querySelector(".captain-team-nav")')
) {
  throw new Error("Captain dashboard DOM observer performance guard did not apply correctly.");
}

console.log("Captain dashboard DOM observers are route-scoped and captain preview text rewrites are bounded.");
