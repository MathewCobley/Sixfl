import { resolve4 } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { get } from "node:https";
import sharp from "sharp";
import { getTeamBadgeImage } from "@/lib/team-badges";

export const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const blocked = new BlockList();
for (const [network, bits] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],
  ["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],
  ["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",3]] as const) blocked.addSubnet(network,bits,"ipv4");
export function isPublicLogoAddress(address: string) {
  return isIP(address) === 4 && !blocked.check(address,"ipv4");
}
function ownHosts() {
  const hosts = new Set(["sixfl.co.uk", "www.sixfl.co.uk"]);
  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXTAUTH_URL]) {
    try { if (value) hosts.add(new URL(value).hostname); } catch { /* Ignore invalid configuration. */ }
  }
  return hosts;
}
function publicArtworkOrigin(): string {
  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXTAUTH_URL, "https://sixfl.co.uk"]) {
    try {
      const url = new URL(value ?? "");
      if (url.protocol === "https:" && !url.username && !url.password && !url.port) return url.origin;
    } catch { /* Ignore invalid/local-development origins. */ }
  }
  return "https://sixfl.co.uk";
}
export function parseLogoLocation(value: string) {
  const raw = value.trim();
  if (!raw || raw.includes("\\") || raw.startsWith("//")) throw new Error("Unsupported logo address.");
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(raw);
  const url = new URL(relative ? `/${raw.replace(/^\/+/, "")}` : raw, "https://sixfl.co.uk");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error("Unsupported logo address.");
  return { url, local: relative || ownHosts().has(url.hostname) };
}
async function localLogo(url: URL, signal: AbortSignal): Promise<Buffer> {
  const imageId = /^\/api\/team-badges\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  if (imageId) {
    const data = await getTeamBadgeImage(imageId, false); // Always full-size, never thumbnail.
    if (!data) throw new Error("Uploaded badge is no longer available.");
    if (data.byteLength > MAX_LOGO_BYTES) throw new Error("Logo exceeds the 8 MB per-image limit.");
    return Buffer.from(data);
  }
  const decoded = decodeURIComponent(url.pathname);
  if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(decoded) || decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) {
    throw new Error("Unsupported stored logo format.");
  }
  // Public artwork is already served as static assets. Read its original
  // public URL through the same bounded, DNS-pinned HTTPS reader instead
  // of tracing the repository/public catalogue into this server function.
  // Database-uploaded badges above still use their full-size stored bytes.
  // Ignore query transforms, matching the previous public-file behaviour.
  const publicUrl = new URL(url.pathname, publicArtworkOrigin());
  return remoteLogo(publicUrl, signal);
}

async function remoteLogo(url: URL, signal: AbortSignal, redirects = 0): Promise<Buffer> {
  if (url.protocol !== "https:" || url.username || url.password || url.port || redirects > 3) throw new Error("External logo needs a direct public HTTPS address.");
  signal.throwIfAborted();
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolve4(url.hostname);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(address => !isPublicLogoAddress(address))) throw new Error("External logo address is not public.");
  // Connect to the checked IP, retaining TLS certificate validation and Host. No
  // second DNS resolution (rebinding), cookies, credentials or internal fetches.
  const result = await new Promise<Buffer | URL>((resolve, reject) => {
    const request = get({ hostname: addresses[0], servername: url.hostname, port: 443,
      path: url.pathname + url.search, agent: false, signal,
      headers: { Host: url.hostname, Accept: "image/*", "Accept-Encoding": "identity" },
    }, response => {
      if (response.statusCode && [301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        try { resolve(new URL(response.headers.location, url)); } catch { reject(new Error("Invalid logo redirect.")); }
        return;
      }
      if (response.statusCode !== 200 || !String(response.headers["content-type"] ?? "").toLowerCase().startsWith("image/")) {
        response.resume(); reject(new Error("Logo server did not return an image.")); return;
      }
      if (Number(response.headers["content-length"] ?? 0) > MAX_LOGO_BYTES) {
        response.destroy(); reject(new Error("Logo exceeds the 8 MB per-image limit.")); return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LOGO_BYTES) { request.destroy(new Error("Logo exceeds the 8 MB per-image limit.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
  });
  return result instanceof URL ? remoteLogo(result, signal, redirects + 1) : result;
}

export async function identifyLogo(data: Buffer): Promise<string> {
  if (!data.length || data.length > MAX_LOGO_BYTES) throw new Error("Logo is empty or too large.");
  const text = data.toString("utf8");
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) {
    // Do not distribute active SVGs or external resources as supplier artwork.
    if (/<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|image|use|animate|set)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|url\s*\(|@import/i.test(text)) {
      throw new Error("SVG contains active or linked content; upload a PNG version.");
    }
    return "svg";
  }
  const png = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.toString("ascii",0,4) === "RIFF" && data.toString("ascii",8,12) === "WEBP";
  const gif = /^GIF8[79]a/.test(data.toString("ascii",0,6));
  if (!png && !jpg && !webp && !gif) throw new Error("Logo is not a supported image.");
  await sharp(data, { limitInputPixels: 50_000_000 }).metadata();
  return png ? "png" : jpg ? "jpg" : webp ? "webp" : "gif";
}

/** Read the URL assigned to this team, preserving the available artwork bytes. */
export async function readTeamLogo(value: string, signal: AbortSignal) {
  const { url, local } = parseLogoLocation(value);
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      local ? localLogo(url, timeout) : remoteLogo(url, timeout),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Logo could not be read within 8 seconds.")), 8000); }),
    ]);
    signal.throwIfAborted();
    return { data, extension: await identifyLogo(data) };
  } catch (error) {
    if (error instanceof Error && /^(Logo |Uploaded badge |Unsupported |External logo |SVG )/.test(error.message)) throw error;
    throw new Error("Logo could not be read. Check or replace the team's badge.");
  } finally { if (timer) clearTimeout(timer); }
}
