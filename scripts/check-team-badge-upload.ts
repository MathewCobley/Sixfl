import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { ImageUploadError, optimiseBadgeImage, readImageUploadForm } from "../src/lib/images/upload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../src/lib/images/constants";

async function main() {
  let checks = 0;
  const check = async (name: string, run: () => Promise<void> | void) => {
    await run();
    checks += 1;
    console.log(`PASS ${name}`);
  };
  const image = async (format: "png" | "jpeg" | "webp", width = 160, height = 80) =>
    sharp({ create: { width, height, channels: 4, background: { r: 0, g: 150, b: 80, alpha: 0.5 } } })
      .toFormat(format).toBuffer();
  const file = (data: Buffer, type: string) => new File([new Uint8Array(data)], "badge", { type });
  const rejects = (run: () => Promise<unknown>, status = 400) => assert.rejects(run,
    (error: unknown) => error instanceof ImageUploadError && error.status === status);

  for (const format of ["png", "jpeg", "webp"] as const) {
    await check(`${format} is decoded, resized without enlargement and re-encoded as PNG`, async () => {
      const result = await optimiseBadgeImage(file(await image(format), `image/${format}`));
      for (const bytes of [result.imageData, result.thumbnailData]) {
        const metadata = await sharp(bytes).metadata();
        assert.equal(metadata.format, "png");
        assert.equal(metadata.width, 160);
        assert.equal(metadata.height, 80);
        assert.equal(metadata.exif, undefined);
        if (format !== "jpeg") assert.equal(metadata.hasAlpha, true);
      }
    });
  }
  await check("large badges fit within 900px; thumbnails fit within 240px", async () => {
    const result = await optimiseBadgeImage(file(await image("png", 1800, 1200), "image/png"));
    assert.equal((await sharp(result.imageData).metadata()).width, 900);
    assert.equal((await sharp(result.thumbnailData).metadata()).width, 240);
  });
  await check("EXIF orientation is applied and metadata stripped", async () => {
    const input = await sharp(await image("jpeg")).withMetadata({ orientation: 6 }).toBuffer();
    const result = await optimiseBadgeImage(file(input, "image/jpeg"));
    const metadata = await sharp(result.imageData).metadata();
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 160);
    assert.equal(metadata.orientation, undefined);
  });
  await check("SVG renamed as PNG is rejected before decoding", () =>
    rejects(() => optimiseBadgeImage(file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/png"))));
  await check("unsupported MIME types are rejected", () =>
    rejects(() => optimiseBadgeImage(file(Buffer.from("GIF89a"), "image/gif"))));
  await check("corrupt PNG data is rejected", () =>
    rejects(() => optimiseBadgeImage(file(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"))));
  await check("empty file is rejected", () =>
    rejects(() => optimiseBadgeImage(file(Buffer.alloc(0), "image/png"))));
  await check("file over 5 MB is rejected", () =>
    rejects(() => optimiseBadgeImage(file(Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1), "image/png")), 413));
  await check("valid multipart request retains file and action", async () => {
    const body = new FormData();
    body.set("action", "save");
    body.set("expectedLogoUrl", "/team-logos/old.png");
    body.set("file", file(await image("png"), "image/png"));
    const result = await readImageUploadForm(new Request("https://example.test/upload", { method: "POST", body }));
    assert.equal(result.get("action"), "save");
    assert.equal(result.get("expectedLogoUrl"), "/team-logos/old.png");
    assert.ok(result.get("file") instanceof File);
  });
  await check("non-multipart requests are rejected", () => rejects(() =>
    readImageUploadForm(new Request("https://example.test/upload", { method: "POST", body: "bad" }))));
  await check("multipart limit applies without a Content-Length header", async () => {
    const body = new FormData();
    body.set("file", file(Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 65536), "image/png"));
    const request = new Request("https://example.test/upload", { method: "POST", body });
    assert.equal(request.headers.get("content-length"), null);
    await rejects(() => readImageUploadForm(request), 413);
  });
  await check("declared oversized body is rejected", () => rejects(() =>
    readImageUploadForm(new Request("https://example.test/upload", {
      method: "POST", body: "bad", headers: {
        "content-type": "multipart/form-data; boundary=test", "content-length": String(MAX_IMAGE_UPLOAD_BYTES * 2),
      },
    })), 413));
  await check("native upload navigation and shared team field remain wired", () => {
    const read = (path: string) => readFileSync(path, "utf8");
    assert.match(read("src/app/(admin)/admin/teams/[id]/layout.tsx"), /href=\{`\/admin\/teams\/\$\{id\}\/badge`\}/);
    const route = read("src/app/api/admin/teams/[teamId]/badge/route.ts");
    assert.ok(route.indexOf("await requireAdmin()") < route.indexOf("await saveTeamBadge("));
    assert.match(route, /isSameOriginUpload\(request\)/);
    assert.match(route, /revalidatePath\("\/", "layout"\)/);
    const store = read("src/lib/team-badges.ts");
    assert.match(store, /prisma\.\$transaction/);
    assert.match(store, /FOR UPDATE/);
    assert.match(store, /team\.logoUrl \?\? ""/);
    assert.match(store, /tx\.team\.update\(/);
    assert.match(store, /data: \{ logoUrl \}/);
    assert.match(store, /new URL\(`/);
    assert.match(read("src/app/api/team-badges/[id]/route.ts"), /"Content-Type": "image\/png"/);
    assert.doesNotMatch(store, /writeFile|unlinkSync/);
  });
  await check("upload route uses the existing teamId dynamic segment without conflicts", () => {
    const segments = readdirSync("src/app/api/admin/teams").filter((name) => name.startsWith("["));
    assert.deepEqual(segments, ["[teamId]"]);
    const route = readFileSync("src/app/api/admin/teams/[teamId]/badge/route.ts", "utf8");
    assert.ok(route.includes("params: Promise<{ teamId: string }>"));
    assert.ok(route.includes("const { teamId } = await context.params"));
  });
  console.log(`Team badge upload: ${checks} checks passed.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
