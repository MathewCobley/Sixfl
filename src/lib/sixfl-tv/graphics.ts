import sharp from "sharp";

export type SixflTvGraphicTeam = {
  name: string;
  logoUrl: string | null;
  score?: number | null;
};

export type SixflTvGraphicFixture = {
  leagueName: string;
  kickoffLabel: string;
  firstTeam: SixflTvGraphicTeam;
  secondTeam: SixflTvGraphicTeam;
  scorers?: string[];
  decisionNote?: string | null;
};

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fit(value: string, max = 34) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function resolveBadgeUrl(value: string | null | undefined, siteUrl: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value, siteUrl);
    const site = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.host !== site.host && !["sixfl.co.uk", "www.sixfl.co.uk"].includes(url.host)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function fetchSixflTvBadge(value: string | null | undefined, siteUrl: string) {
  const url = resolveBadgeUrl(value, siteUrl);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return null;
    return await sharp(bytes).png().resize(360, 360, { fit: "contain", withoutEnlargement: true }).toBuffer();
  } catch {
    return null;
  }
}

function badgeImage(buffer: Buffer | null, x: number, y: number, size: number, fallback: string) {
  if (buffer) {
    return `<image href="data:image/png;base64,${buffer.toString("base64")}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const initials = fallback.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("");
  return `<g><circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2 - 8}" fill="#07140f" stroke="#34d399" stroke-width="8"/><text x="${x + size / 2}" y="${y + size / 2 + 24}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="800" fill="#ecfdf5">${xml(initials || "6")}</text></g>`;
}

function stadiumBackground(width: number, height: number) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#020805"/><stop offset="0.48" stop-color="#0b1a13"/><stop offset="1" stop-color="#07100c"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="65%"><stop offset="0" stop-color="#34d399" stop-opacity="0.24"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.45"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g opacity="0.16" stroke="#a7f3d0" fill="none" stroke-width="3">
    <rect x="${width * 0.08}" y="${height * 0.58}" width="${width * 0.84}" height="${height * 0.34}" rx="12"/>
    <line x1="${width / 2}" y1="${height * 0.58}" x2="${width / 2}" y2="${height * 0.92}"/>
    <circle cx="${width / 2}" cy="${height * 0.75}" r="${height * 0.09}"/>
  </g>
  <g opacity="0.22"><circle cx="${width * 0.14}" cy="${height * 0.14}" r="7" fill="#ffffff"/><circle cx="${width * 0.28}" cy="${height * 0.11}" r="5" fill="#ffffff"/><circle cx="${width * 0.72}" cy="${height * 0.11}" r="5" fill="#ffffff"/><circle cx="${width * 0.86}" cy="${height * 0.14}" r="7" fill="#ffffff"/></g>`;
}

export async function createSixflTvThumbnail(input: {
  fixture: SixflTvGraphicFixture;
  headline: string;
  strapline: string;
  showScore: boolean;
  siteUrl: string;
}) {
  const [firstBadge, secondBadge] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
  ]);
  const firstScore = input.fixture.firstTeam.score;
  const secondScore = input.fixture.secondTeam.score;
  const scoreVisible = input.showScore && Number.isInteger(firstScore) && Number.isInteger(secondScore);
  const headline = fit(input.headline || "SIXFL TV", 28);
  const strapline = fit(input.strapline || input.fixture.leagueName, 54);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    ${stadiumBackground(1280, 720)}
    <text x="640" y="78" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="800" letter-spacing="7" fill="#6ee7b7">SIXFL TV</text>
    <text x="640" y="146" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="#ffffff">${xml(headline)}</text>
    <text x="640" y="188" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="#d1fae5">${xml(strapline)}</text>
    <g filter="url(#shadow)">${badgeImage(firstBadge, 160, 238, 210, input.fixture.firstTeam.name)}${badgeImage(secondBadge, 910, 238, 210, input.fixture.secondTeam.name)}</g>
    <text x="265" y="500" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="37" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.firstTeam.name, 24))}</text>
    <text x="1015" y="500" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="37" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.secondTeam.name, 24))}</text>
    ${scoreVisible ? `<text x="640" y="418" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="118" font-weight="900" fill="#ffffff">${firstScore} <tspan fill="#34d399">–</tspan> ${secondScore}</text>` : `<text x="640" y="405" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="54" font-weight="900" fill="#ffffff">VS</text>`}
    <text x="640" y="570" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#a7f3d0">${xml(fit(input.fixture.leagueName, 44))}</text>
    <text x="640" y="612" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="600" fill="#d1d5db">${xml(input.fixture.kickoffLabel)}</text>
    <rect x="440" y="652" width="400" height="5" rx="3" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function createSixflTvVideoCard(input: {
  fixture: SixflTvGraphicFixture;
  mode: "TITLE" | "FULL_TIME";
  label: string;
  siteUrl: string;
}) {
  const [firstBadge, secondBadge] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
  ]);
  const scoreVisible = input.mode === "FULL_TIME" && Number.isInteger(input.fixture.firstTeam.score) && Number.isInteger(input.fixture.secondTeam.score);
  const scorerLine = (input.fixture.scorers || []).slice(0, 5).join(" · ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${stadiumBackground(1920, 1080)}
    <text x="960" y="110" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="900" letter-spacing="10" fill="#6ee7b7">SIXFL TV</text>
    <text x="960" y="205" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="62" font-weight="900" fill="#ffffff">${xml(input.mode === "FULL_TIME" ? "FULL TIME" : fit(input.label, 34))}</text>
    <g filter="url(#shadow)">${badgeImage(firstBadge, 240, 310, 300, input.fixture.firstTeam.name)}${badgeImage(secondBadge, 1380, 310, 300, input.fixture.secondTeam.name)}</g>
    <text x="390" y="700" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.firstTeam.name, 25))}</text>
    <text x="1530" y="700" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.secondTeam.name, 25))}</text>
    ${scoreVisible ? `<text x="960" y="585" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="180" font-weight="900" fill="#ffffff">${input.fixture.firstTeam.score} <tspan fill="#34d399">–</tspan> ${input.fixture.secondTeam.score}</text>` : `<text x="960" y="560" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="92" font-weight="900" fill="#ffffff">VS</text>`}
    <text x="960" y="790" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#a7f3d0">${xml(fit(input.fixture.leagueName, 56))}</text>
    <text x="960" y="842" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="600" fill="#d1d5db">${xml(input.fixture.kickoffLabel)}</text>
    ${scorerLine ? `<text x="960" y="918" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${xml(fit(scorerLine, 95))}</text>` : ""}
    ${input.fixture.decisionNote ? `<text x="960" y="966" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#fcd34d">${xml(fit(input.fixture.decisionNote, 90))}</text>` : ""}
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
