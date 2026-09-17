const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const file = "src/app/api/admin/sixfl-tv/youtube/callback/route.ts";
const source = fs.readFileSync(file, "utf8");

function load(overrides = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mocks = {
    "next/server": {
      NextResponse: {
        redirect(url, status) {
          return { url: String(url), status };
        },
      },
    },
    "@/lib/requireAdmin": {
      requireAdmin: async () => ({ user: { id: "admin" }, session: null }),
    },
    "@/lib/sixfl-tv/studio": {
      StudioError: class StudioError extends Error {},
    },
    "@/lib/sixfl-tv/youtube": {
      completeYoutubeAuthorisation: async () => "fixture-123",
    },
    ...overrides,
  };
  new Function("require", "module", "exports", compiled)(
    (id) => mocks[id] ?? require(id),
    mod,
    mod.exports,
  );
  return mod.exports;
}

test("successful Google callback returns to the public SIXFL fixture page, never Railway localhost", async () => {
  const prior = process.env.YOUTUBE_REDIRECT_URI;
  process.env.YOUTUBE_REDIRECT_URI = "https://www.sixfl.co.uk/api/admin/sixfl-tv/youtube/callback";
  try {
    const route = load();
    const response = await route.GET(new Request("http://localhost:8080/api/admin/sixfl-tv/youtube/callback?code=ok&state=ok"));
    assert.equal(response.status, 302);
    assert.equal(response.url, "https://www.sixfl.co.uk/admin/sixfl-tv/footage/fixture-123?youtube=connected");
    assert.doesNotMatch(response.url, /localhost|railway\.internal/);
  } finally {
    if (prior === undefined) delete process.env.YOUTUBE_REDIRECT_URI;
    else process.env.YOUTUBE_REDIRECT_URI = prior;
  }
});

test("denied Google callback also returns to the public SIXFL page", async () => {
  const prior = process.env.YOUTUBE_REDIRECT_URI;
  process.env.YOUTUBE_REDIRECT_URI = "https://www.sixfl.co.uk/api/admin/sixfl-tv/youtube/callback";
  try {
    const route = load();
    const response = await route.GET(new Request("http://localhost:8080/api/admin/sixfl-tv/youtube/callback?error=access_denied"));
    assert.equal(response.status, 302);
    assert.match(response.url, /^https:\/\/www\.sixfl\.co\.uk\/admin\/sixfl-tv\?youtubeError=/);
    assert.doesNotMatch(response.url, /localhost|railway\.internal/);
  } finally {
    if (prior === undefined) delete process.env.YOUTUBE_REDIRECT_URI;
    else process.env.YOUTUBE_REDIRECT_URI = prior;
  }
});

test("global YouTube authorisation returns to the SIXFL TV hub", async () => {
  const prior = process.env.YOUTUBE_REDIRECT_URI;
  process.env.YOUTUBE_REDIRECT_URI = "https://www.sixfl.co.uk/api/admin/sixfl-tv/youtube/callback";
  try {
    const route = load({
      "@/lib/sixfl-tv/youtube": {
        completeYoutubeAuthorisation: async () => null,
      },
    });
    const response = await route.GET(new Request("http://localhost:8080/api/admin/sixfl-tv/youtube/callback?code=ok&state=ok"));
    assert.equal(response.status, 302);
    assert.equal(response.url, "https://www.sixfl.co.uk/admin/sixfl-tv?youtube=connected");
  } finally {
    if (prior === undefined) delete process.env.YOUTUBE_REDIRECT_URI;
    else process.env.YOUTUBE_REDIRECT_URI = prior;
  }
});

test("callback source no longer builds post-auth redirects from request.url", () => {
  assert.match(source, /process\.env\.YOUTUBE_REDIRECT_URI/);
  assert.doesNotMatch(source, /new URL\([^\n]+request\.url\)/);
});
