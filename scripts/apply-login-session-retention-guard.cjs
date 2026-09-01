const fs = require("node:fs");
const path = require("node:path");

const authPath = path.join(process.cwd(), "src", "auth.ts");

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Login session retention: ${label} anchor was not found.`);
  }
  return source.replace(before, after);
}

function apply() {
  let source = fs.readFileSync(authPath, "utf8");
  const original = source;

  source = replaceRequired(
    source,
    `const LOGIN_CTA_LABEL = "Sign in to SIXFL";
const CTA_PLACEHOLDER = "{{cta}}";

function getSiteUrl() {
  return (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\\/+$/, "");
}`,
    `const LOGIN_CTA_LABEL = "Sign in to SIXFL";
const CTA_PLACEHOLDER = "{{cta}}";
const CANONICAL_SITE_URL = "https://sixfl.co.uk";
const CANONICAL_HOST = "sixfl.co.uk";
const LEGACY_WWW_HOST = "www.sixfl.co.uk";

function canonicaliseSIXFLUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() === LEGACY_WWW_HOST) {
      parsed.protocol = "https:";
      parsed.hostname = CANONICAL_HOST;
      parsed.port = "";
    }
    const callbackUrl = parsed.searchParams.get("callbackUrl");
    if (callbackUrl) {
      try {
        const callback = new URL(callbackUrl);
        if (callback.hostname.toLowerCase() === LEGACY_WWW_HOST) {
          callback.protocol = "https:";
          callback.hostname = CANONICAL_HOST;
          callback.port = "";
          parsed.searchParams.set("callbackUrl", callback.toString());
        }
      } catch {}
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function getSiteUrl() {
  const configured = (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    CANONICAL_SITE_URL
  ).replace(/\\/+$/, "");
  return canonicaliseSIXFLUrl(configured).replace(/\\/+$/, "");
}`,
    "canonical URL helper",
  );

  source = replaceRequired(
    source,
    `      async sendVerificationRequest({ identifier, url, provider }) {
        const email = identifier.toLowerCase().trim();`,
    `      async sendVerificationRequest({ identifier, url, provider }) {
        const email = identifier.toLowerCase().trim();
        const canonicalUrl = canonicaliseSIXFLUrl(url);`,
    "canonical magic-link value",
  );

  source = replaceRequired(
    source,
    `        const emailContent = await buildLoginMagicLinkEmail({
          email,
          url,
          pendingCaptain,
        });`,
    `        const emailContent = await buildLoginMagicLinkEmail({
          email,
          url: canonicalUrl,
          pendingCaptain,
        });`,
    "login email URL",
  );

  source = replaceRequired(source, "          magicLinkUrl: url,", "          magicLinkUrl: canonicalUrl,", "activity URL");

  if (!source.includes("    async redirect({ url, baseUrl }) {")) {
    const anchor = "\n    async session({ session, user }) {";
    if (!source.includes(anchor)) throw new Error("Session callback anchor was not found.");
    const callback = `
    async redirect({ url, baseUrl }) {
      const canonicalBaseUrl = canonicaliseSIXFLUrl(baseUrl).replace(/\\/+$/, "");
      if (url.startsWith("/")) return canonicalBaseUrl + url;
      try {
        const requestedUrl = new URL(canonicaliseSIXFLUrl(url));
        const canonicalBase = new URL(canonicalBaseUrl);
        if (requestedUrl.origin === canonicalBase.origin) return requestedUrl.toString();
      } catch {}
      return canonicalBaseUrl;
    },
`;
    source = source.replace(anchor, callback + anchor);
  }

  for (const marker of [
    'const CANONICAL_SITE_URL = "https://sixfl.co.uk";',
    "const canonicalUrl = canonicaliseSIXFLUrl(url);",
    "url: canonicalUrl,",
    "magicLinkUrl: canonicalUrl,",
    "async redirect({ url, baseUrl }) {",
  ]) {
    if (!source.includes(marker)) throw new Error(`Missing safeguard: ${marker}`);
  }

  if (source !== original) fs.writeFileSync(authPath, source, "utf8");
  return source !== original;
}

const first = apply();
const second = apply();
if (second) throw new Error("Login session retention patch is not idempotent.");
console.log(first ? "Canonical SIXFL session safeguards applied." : "Canonical SIXFL session safeguards already applied.");
