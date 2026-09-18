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
  firstTeamLineup?: string[];
  secondTeamLineup?: string[];
  firstTeamForm?: Array<"W" | "D" | "L">;
  secondTeamForm?: Array<"W" | "D" | "L">;
  predictor?: { firstTeamScore: number; secondTeamScore: number; headline?: string | null } | null;
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

const brandingCache = new Map<string, Promise<Buffer>>();
async function brandingAsset(siteUrl: string, pathname: string) {
  const base = new URL(siteUrl);
  const url = new URL(pathname, base);
  if (url.origin !== base.origin) throw new Error("SIXFL TV branding asset must stay on the SIXFL site.");
  const cacheKey = url.toString();
  const existing = brandingCache.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`SIXFL TV branding asset is unavailable (${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("SIXFL TV branding asset did not return an image.");
    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > 8 * 1024 * 1024) throw new Error("SIXFL TV branding asset size is invalid.");
    return sharp(source).png().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  })().catch(error => {
    brandingCache.delete(cacheKey);
    throw error;
  });
  brandingCache.set(cacheKey, pending);
  return pending;
}
function sixflTvLogo(siteUrl: string) { return brandingAsset(siteUrl, "/Sixfl-tv.png"); }
function sixflPredictorLogo(siteUrl: string) { return brandingAsset(siteUrl, "/logos/sixfl-ai-predictor.png"); }
function logoImage(buffer: Buffer, x: number, y: number, width: number, height: number, opacity = 1) {
  return `<image href="data:image/png;base64,${buffer.toString("base64")}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
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

function formColour(result: "W" | "D" | "L") {
  if (result === "W") return "#10b981";
  if (result === "L") return "#ef4444";
  return "#64748b";
}
function formRun(results: Array<"W" | "D" | "L"> | undefined, x: number, y: number, anchor: "start" | "end" = "start") {
  const values = (results || []).slice(-5);
  if (!values.length) return "";
  const size = 42, gap = 10, width = values.length * size + Math.max(0, values.length - 1) * gap;
  const start = anchor === "end" ? x - width : x;
  return `<g aria-label="Recent form">${values.map((result, index) => {
    const bx = start + index * (size + gap);
    return `<rect x="${bx}" y="${y}" width="${size}" height="${size}" rx="10" fill="${formColour(result)}" fill-opacity="0.88"/><text x="${bx + size / 2}" y="${y + 29}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="#ffffff">${result}</text>`;
  }).join("")}</g>`;
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
  const [firstBadge, secondBadge, sixflTvLogoBytes] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
    sixflTvLogo(input.siteUrl),
  ]);
  const firstScore = input.fixture.firstTeam.score;
  const secondScore = input.fixture.secondTeam.score;
  const scoreVisible = input.showScore && Number.isInteger(firstScore) && Number.isInteger(secondScore);
  const headline = fit(input.headline || "SIXFL TV", 28);
  const strapline = fit(input.strapline || input.fixture.leagueName, 54);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    ${stadiumBackground(1280, 720)}
    ${logoImage(sixflTvLogoBytes, 500, 28, 280, 90)}
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
  const [firstBadge, secondBadge, sixflTvLogoBytes] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
    sixflTvLogo(input.siteUrl),
  ]);
  const scoreVisible = Number.isInteger(input.fixture.firstTeam.score) && Number.isInteger(input.fixture.secondTeam.score);
  const cardHeading = input.mode === "FULL_TIME" ? "FULL TIME" : "MATCH RESULT";
  const scorerLines = input.mode === "FULL_TIME" ? (input.fixture.scorers || []).slice(0, 3).map(value => fit(value, 82)) : [];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 28, 400, 128)}
    <text x="960" y="225" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="60" font-weight="900" fill="#ffffff">${xml(cardHeading)}</text>

    <text x="350" y="300" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.firstTeam.name, 24))}</text>
    <text x="1570" y="300" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.secondTeam.name, 24))}</text>
    <g filter="url(#shadow)">${badgeImage(firstBadge, 220, 330, 260, input.fixture.firstTeam.name)}${badgeImage(secondBadge, 1440, 330, 260, input.fixture.secondTeam.name)}</g>

    ${scoreVisible ? `<text x="960" y="535" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="176" font-weight="900" fill="#ffffff">${input.fixture.firstTeam.score} <tspan fill="#34d399">–</tspan> ${input.fixture.secondTeam.score}</text>` : `<text x="960" y="520" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="92" font-weight="900" fill="#ffffff">VS</text>`}
    ${scorerLines.map((line, index) => `<text x="960" y="${625 + index * 40}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${xml(line)}</text>`).join("")}

    <text x="350" y="650" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="800" letter-spacing="3" fill="#a7f3d0">RECENT FORM</text>
    ${formRun(input.fixture.firstTeamForm, 220, 675, "start")}
    <text x="1570" y="650" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="800" letter-spacing="3" fill="#a7f3d0">RECENT FORM</text>
    ${formRun(input.fixture.secondTeamForm, 1700, 675, "end")}

    <text x="960" y="840" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#a7f3d0">${xml(fit(input.fixture.leagueName, 56))}</text>
    <text x="960" y="892" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="600" fill="#d1d5db">${xml(input.fixture.kickoffLabel)}</text>
    ${input.fixture.decisionNote ? `<text x="960" y="944" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#fcd34d">${xml(fit(input.fixture.decisionNote, 90))}</text>` : ""}
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvGoalOfMonthCard(input: { siteUrl: string }) {
  const destination = new URL("/goal-of-the-month", input.siteUrl);
  const displayUrl = `${destination.host.replace(/^www\./, "")}${destination.pathname}`;
  const sixflTvLogoBytes = await sixflTvLogo(input.siteUrl);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 36, 400, 128)}
    <text x="960" y="300" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="92" font-weight="900" fill="#ffffff">GOAL OF THE MONTH</text>
    <text x="960" y="390" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="800" fill="#d1fae5">Think one of these deserves it?</text>
    <rect x="470" y="485" width="980" height="190" rx="34" fill="#020805" fill-opacity="0.72" stroke="#34d399" stroke-width="5"/>
    <text x="960" y="565" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="900" fill="#ffffff">NOMINATE &amp; VOTE</text>
    <text x="960" y="630" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#6ee7b7">${xml(displayUrl)}</text>
    <text x="960" y="775" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#ffffff">Nominate until the 5th · Vote 6th–12th</text>
    <text x="960" y="835" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="600" fill="#d1d5db">Player chosen · Monthly winner announced from the 13th</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvScoreBug(input: { fixture: SixflTvGraphicFixture; siteUrl: string }) {
  const sixflTvLogoBytes = await sixflTvLogo(input.siteUrl);
  const firstScore = input.fixture.firstTeam.score;
  const secondScore = input.fixture.secondTeam.score;
  if (!Number.isInteger(firstScore) || !Number.isInteger(secondScore)) throw new Error("A confirmed final score is required for the SIXFL TV scorebug.");
  const firstName = fit(input.fixture.firstTeam.name, 24);
  const secondName = fit(input.fixture.secondTeam.name, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <g transform="translate(54 46)">
      <rect width="690" height="92" rx="14" fill="#020805" fill-opacity="0.88" stroke="#34d399" stroke-width="3"/>
      <rect x="0" y="0" width="76" height="92" rx="14" fill="#10b981"/>
      <text x="38" y="57" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="#02140d">FT</text>
      <text x="104" y="58" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="800" fill="#ffffff">${xml(firstName)}</text>
      <text x="322" y="58" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="900" fill="#ffffff">${firstScore}</text>
      <text x="363" y="58" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800" fill="#34d399">–</text>
      <text x="404" y="58" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="900" fill="#ffffff">${secondScore}</text>
      <text x="436" y="58" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="800" fill="#ffffff">${xml(secondName)}</text>
    </g>
    ${logoImage(sixflTvLogoBytes, 1540, 38, 320, 102, 0.94)}
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvWatermark(input: { siteUrl: string }) {
  const sixflTvLogoBytes = await sixflTvLogo(input.siteUrl);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${logoImage(sixflTvLogoBytes, 1540, 38, 320, 102, 0.94)}
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvLineupCard(input: { fixture: SixflTvGraphicFixture; siteUrl: string }) {
  const first = (input.fixture.firstTeamLineup || []).slice(0, 12);
  const second = (input.fixture.secondTeamLineup || []).slice(0, 12);
  if (!first.length && !second.length) return null;
  const [sixflTvLogoBytes, predictorLogoBytes] = await Promise.all([sixflTvLogo(input.siteUrl), sixflPredictorLogo(input.siteUrl)]);
  const rows = Math.max(first.length, second.length, 1);
  const startY = 420, rowGap = Math.min(50, Math.floor(450 / rows));
  const list = (items: string[], x: number) => items.map((name, index) => `<text x="${x}" y="${startY + index * rowGap}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="700" fill="#ffffff">${xml(fit(name, 34))}</text>`).join("");
  const predictor = input.fixture.predictor;
  const predictorPanel = predictor
    ? `<g><rect x="700" y="242" width="520" height="126" rx="24" fill="#020805" fill-opacity="0.82" stroke="#34d399" stroke-width="3"/>
        ${logoImage(predictorLogoBytes, 770, 252, 380, 62)}
        <text x="960" y="326" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" letter-spacing="3" fill="#a7f3d0">PRE-MATCH PREDICTION</text>
        <text x="960" y="365" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="900" fill="#ffffff">${predictor.firstTeamScore} <tspan fill="#34d399">–</tspan> ${predictor.secondTeamScore}</text></g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 24, 400, 128)}
    <text x="960" y="205" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="900" fill="#ffffff">MATCHDAY SQUADS</text>
    ${predictorPanel}
    <text x="480" y="390" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="900" fill="#6ee7b7">${xml(fit(input.fixture.firstTeam.name, 28))}</text>
    <text x="1440" y="390" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="900" fill="#6ee7b7">${xml(fit(input.fixture.secondTeam.name, 28))}</text>
    <line x1="960" y1="380" x2="960" y2="910" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
    ${list(first, 480)}
    ${list(second, 1440)}
    <text x="960" y="972" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="600" fill="#d1d5db">${xml(fit(input.fixture.leagueName, 62))} · ${xml(input.fixture.kickoffLabel)}</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
