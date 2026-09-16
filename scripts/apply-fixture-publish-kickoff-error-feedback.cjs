const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const publishActionsPath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "publish-actions.ts",
);
const fixturesPagePath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "page.tsx",
);

for (const target of [publishActionsPath, fixturesPagePath]) {
  if (!fs.existsSync(target)) {
    throw new Error(`Fixture publish feedback target not found: ${target}`);
  }
}

function replaceRequired(source, anchor, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${description}.`);
  }
  return source.replace(anchor, replacement);
}

let actions = fs.readFileSync(publishActionsPath, "utf8");

if (!actions.includes("function getKickoffWindowPublishError")) {
  const anchor = "function isRetryablePublishError(error: unknown) {";
  const helper = `function getKickoffWindowPublishError(error: unknown) {\n  if (!(error instanceof Error)) return null;\n  const message = error.message.trim();\n  if (message.length === 0 || message.length > 1000 || /[\\r\\n]/.test(message)) return null;\n  if (!message.includes(\" cannot kick off \")) return null;\n  if (!message.includes(\"This fixture is scheduled for\")) return null;\n  if (!message.includes(\"Change the fixture time or update the team kick-off rules.\")) return null;\n  return message;\n}\n\n`;
  actions = replaceRequired(
    actions,
    anchor,
    helper + anchor,
    "fixture publish retry helper",
  );
}

const oldCatch = `  } catch (error) {\n    if (error instanceof VeoAllocationError) {\n      redirect(\`/admin/leagues/\${input.leagueId}/veo-priority?error=\${encodeURIComponent(error.message)}\`);\n    }\n    throw error;\n  }`;
const newCatch = `  } catch (error) {\n    if (error instanceof VeoAllocationError) {\n      redirect(\`/admin/leagues/\${input.leagueId}/veo-priority?error=\${encodeURIComponent(error.message)}\`);\n    }\n    const kickoffWindowError = getKickoffWindowPublishError(error);\n    if (kickoffWindowError) {\n      redirect(buildAdminFixturesHref({\n        publish: \"error\",\n        leagueId: input.leagueId,\n        round: input.round,\n        divisionId: input.divisionId,\n        publishError: \`kickoff_window:\${kickoffWindowError}\`,\n      }));\n    }\n    throw error;\n  }`;
actions = replaceRequired(
  actions,
  oldCatch,
  newCatch,
  "fixture publication validation catch",
);
fs.writeFileSync(publishActionsPath, actions, "utf8");

let page = fs.readFileSync(fixturesPagePath, "utf8");
if (!page.includes('publishError?.startsWith("kickoff_window:")')) {
  const anchor = `  if (publish === \"error\" && publishError === \"reply_not_configured\") {\n    return {\n      tone: \"error\",\n      message: \`Reply-by-email is not configured yet. Add EMAIL_REPLY_DOMAIN in the deployed environment before publishing fixtures for \${scopeLabel}.\`,\n    };\n  }\n\n`;
  const replacement = `${anchor}  if (publish === \"error\" && publishError?.startsWith(\"kickoff_window:\")) {\n    const detail = publishError.slice(\"kickoff_window:\".length).trim();\n    return {\n      tone: \"error\",\n      message: detail || \`A fixture is outside a team's allowed kick-off window for \${scopeLabel}. Change the fixture time or use the kick-off rules override before publishing.\`,\n    };\n  }\n\n`;
  page = replaceRequired(
    page,
    anchor,
    replacement,
    "fixture publish reply-domain error notice",
  );
}
fs.writeFileSync(fixturesPagePath, page, "utf8");

const finalActions = fs.readFileSync(publishActionsPath, "utf8");
const finalPage = fs.readFileSync(fixturesPagePath, "utf8");
for (const marker of [
  "function getKickoffWindowPublishError",
  "kickoff_window:${kickoffWindowError}",
]) {
  if (!finalActions.includes(marker)) {
    throw new Error(`Fixture publish action marker missing: ${marker}`);
  }
}
for (const marker of [
  'publishError?.startsWith("kickoff_window:")',
  "use the kick-off rules override before publishing",
]) {
  if (!finalPage.includes(marker)) {
    throw new Error(`Fixture publish page marker missing: ${marker}`);
  }
}

console.log("Fixture kick-off publication errors now return to admin with useful feedback.");
