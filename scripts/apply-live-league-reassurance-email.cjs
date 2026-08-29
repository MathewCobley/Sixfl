const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = process.cwd();
const targetPath = path.join(
  root,
  "src/app/(admin)/admin/leads/reassurance-email-actions.ts",
);
const payloadDir = path.join(
  root,
  "scripts/payloads/live-league-reassurance-action",
);
const expectedSha256 =
  "3fc60abd73bf135ce31c36e683cfd837bdbdd532947907331aa70c2db94822ec";

const partNames = fs
  .readdirSync(payloadDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort();

if (partNames.length !== 6) {
  throw new Error(
    `Expected 6 live-league reassurance payload parts, found ${partNames.length}.`,
  );
}

const compressedBase64 = partNames
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim())
  .join("");

const nextContent = zlib.gunzipSync(
  Buffer.from(compressedBase64, "base64"),
);
const actualSha256 = crypto
  .createHash("sha256")
  .update(nextContent)
  .digest("hex");

if (actualSha256 !== expectedSha256) {
  throw new Error(
    `Live-league reassurance payload checksum mismatch: ${actualSha256}`,
  );
}

const currentContent = fs.existsSync(targetPath)
  ? fs.readFileSync(targetPath)
  : null;

if (!currentContent || !currentContent.equals(nextContent)) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, nextContent);
  console.log("Applied adaptive new/live league reassurance email source.");
} else {
  console.log("Adaptive reassurance email source is already current.");
}
