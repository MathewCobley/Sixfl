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
  let source = input;

  source = replaceRequired(
    source,
    [
      "  useEffect(() => {",
      "    if (isManagedTeam) return;",
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
      "  }, [isManagedTeam, pathname, searchParamsKey]);",
    ].join("\n"),
    [
      "  useEffect(() => {",
      "    if (isManagedTeam) return;",
      "",
      "    const root = document.querySelector(\".captain-team-shell\") ?? document.body;",
      "    let frame = 0;",
      "    let observer: MutationObserver;",
      "",
      "    const scheduleRewrite = () => {",
      "      if (frame) return;",
      "      frame = window.requestAnimationFrame(() => {",
      "        frame = 0;",
      "        observer.disconnect();",
      "        rewriteCaptainFacingText();",
      "        observer.observe(root, { childList: true, subtree: true });",
      "      });",
      "    };",
      "",
      "    observer = new MutationObserver(scheduleRewrite);",
      "    observer.observe(root, { childList: true, subtree: true });",
      "    scheduleRewrite();",
      "",
      "    return () => {",
      "      if (frame) window.cancelAnimationFrame(frame);",
      "      observer.disconnect();",
      "    };",
      "  }, [isManagedTeam, pathname, searchParamsKey]);",
    ].join("\n"),
    "captain text observer debounce",
  );

  return source;
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

const previewSource = fs.readFileSync(
  path.join(root, "src/components/captain/AdminPlayerPreviewLinks.tsx"),
  "utf8",
);
const headerSource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainViewModeHeader.tsx"),
  "utf8",
);
const reminderSource = fs.readFileSync(
  path.join(root, "src/components/captain/CaptainOnboardingReminderBridge.tsx"),
  "utf8",
);

if (
  !previewSource.includes("if (!teamId) return;") ||
  headerSource.includes("characterData: true") ||
  !headerSource.includes("const scheduleRewrite = () =>") ||
  reminderSource.includes("attributes: true") ||
  !reminderSource.includes('const nav = document.querySelector(".captain-team-nav")')
) {
  throw new Error("Captain dashboard DOM observer performance guard did not apply correctly.");
}

console.log(
  "Captain dashboard DOM observers are route-scoped, debounced and limited to the elements they actually manage.",
);
