import sharp from "sharp";

export type SixflTvGraphicTeam = {
  name: string;
  logoUrl: string | null;
  broadcastCode?: string | null;
  score?: number | null;
};

export type SixflTvGraphicFixture = {
  leagueName: string;
  kickoffLabel: string;
  kickoffIso?: string;
  firstTeam: SixflTvGraphicTeam;
  secondTeam: SixflTvGraphicTeam;
  scorers?: string[];
  firstTeamLineup?: string[];
  secondTeamLineup?: string[];
  firstTeamForm?: Array<"W" | "D" | "L">;
  secondTeamForm?: Array<"W" | "D" | "L">;
  predictor?: { firstTeamScore: number; secondTeamScore: number; headline?: string | null } | null;
  leagueTable?: {
    title: string;
    rows: Array<{
      position: number;
      teamId: string;
      teamName: string;
      played: number;
      goalDifference: number;
      points: number;
      movement?: "UP" | "DOWN" | "SAME" | null;
    }>;
  } | null;
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

function scorerLinesForTeam(scorers: string[] | undefined, teamName: string) {
  const prefix = `${teamName.trim()}:`;
  const row = (scorers || []).find(value => value.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  if (!row) return [] as string[];
  return row
    .trim()
    .slice(prefix.length)
    .split(",")
    .map(value => fit(value.trim(), 30))
    .filter(Boolean)
    .slice(0, 4);
}

function broadcastCodeForTeam(team: SixflTvGraphicTeam) {
  const saved = String(team.broadcastCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (saved.length === 3) return saved;
  const fallback = team.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (fallback.slice(0, 3) || "SIX").padEnd(3, "X");
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

const fontCache = new Map<string, Promise<Buffer>>();
async function sixflFont(siteUrl: string, pathname: string) {
  const base = new URL(siteUrl);
  const url = new URL(pathname, base);
  if (url.origin !== base.origin) throw new Error("SIXFL TV font asset must stay on the SIXFL site.");
  const key = url.toString();
  const existing = fontCache.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`SIXFL TV font asset is unavailable (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("SIXFL TV font asset size is invalid.");
    return bytes;
  })().catch(error => {
    fontCache.delete(key);
    throw error;
  });
  fontCache.set(key, pending);
  return pending;
}

async function embeddedFontStyle(siteUrl: string) {
  const [regular, bold] = await Promise.all([
    sixflFont(siteUrl, "/fonts/Inter-Regular.ttf"),
    sixflFont(siteUrl, "/fonts/Inter-Bold.ttf"),
  ]);
  return `<style><![CDATA[
    @font-face { font-family: 'SIXFLInter'; src: url(data:font/ttf;base64,${regular.toString("base64")}) format('truetype'); font-weight: 400; font-style: normal; }
    @font-face { font-family: 'SIXFLInter'; src: url(data:font/ttf;base64,${bold.toString("base64")}) format('truetype'); font-weight: 700 900; font-style: normal; }
    text { font-family: 'SIXFLInter','DejaVu Sans',sans-serif; }
  ]]></style>`;
}
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
  return `<g><circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2 - 8}" fill="#07140f" stroke="#34d399" stroke-width="8"/><text x="${x + size / 2}" y="${y + size / 2 + 24}" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="64" font-weight="800" fill="#ecfdf5">${xml(initials || "6")}</text></g>`;
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
    return `<rect x="${bx}" y="${y}" width="${size}" height="${size}" rx="10" fill="${formColour(result)}" fill-opacity="0.88"/><text x="${bx + size / 2}" y="${y + 29}" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="22" font-weight="900" fill="#ffffff">${result}</text>`;
  }).join("")}</g>`;
}

type ThumbnailTextAlign = "left" | "center" | "right";

async function thumbnailTextPng(input: {
  text?: string;
  markup?: string;
  width: number;
  height: number;
  fontSize: number;
  bold?: boolean;
  fill: string;
  align?: ThumbnailTextAlign;
  letterSpacing?: number;
}) {
  const fontfile = input.bold ? "public/fonts/Inter-Bold.ttf" : "public/fonts/Inter-Regular.ttf";
  const body = input.markup ?? xml(input.text ?? "");
  const spacing = input.letterSpacing ? ` letter_spacing="${Math.round(input.letterSpacing * 1024)}"` : "";
  const markup = input.markup
    ? input.markup
    : `<span foreground="${input.fill}"${spacing}>${body}</span>`;
  return sharp({
    text: {
      text: markup,
      font: `Inter ${input.fontSize}`,
      fontfile,
      width: input.width,
      height: input.height,
      align: input.align ?? "left",
      rgba: true,
    },
  }).png().toBuffer();
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
  kind: "HIGHLIGHTS" | "FULL_MATCH";
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
  const isHighlights = input.kind === "HIGHLIGHTS";
  const accent = isHighlights ? "#21e6a1" : "#ff365f";
  const accentDeep = isHighlights ? "#063e2c" : "#4b0a18";
  const typeLabel = isHighlights ? "HIGHLIGHTS" : "FULL MATCH";
  const headline = fit(input.headline || (isHighlights ? "MATCH HIGHLIGHTS" : "FULL MATCH"), 30).toUpperCase();
  const headlineWords = headline.split(/\s+/).filter(Boolean);
  const headlineSplit = headlineWords.length > 1
    ? Math.max(1, Math.ceil(headlineWords.length / 2))
    : 1;
  const headlineLineOne = headlineWords.slice(0, headlineSplit).join(" ");
  const headlineLineTwo = headlineWords.slice(headlineSplit).join(" ");
  const firstCode = broadcastCodeForTeam(input.fixture.firstTeam);
  const secondCode = broadcastCodeForTeam(input.fixture.secondTeam);
  const matchup = `${fit(input.fixture.firstTeam.name, 22)}  •  ${fit(input.fixture.secondTeam.name, 22)}`;
  const league = fit(input.strapline || input.fixture.leagueName.replaceAll("·", "•"), 58);
  const date = input.fixture.kickoffLabel;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#071932"/>
        <stop offset="0.5" stop-color="#07130f"/>
        <stop offset="1" stop-color="#020504"/>
      </linearGradient>
      <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#123a28"/>
        <stop offset="1" stop-color="#03100b"/>
      </linearGradient>
      <linearGradient id="lowerShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.92"/>
      </linearGradient>
      <radialGradient id="lampGlowLeft" cx="23%" cy="18%" r="25%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
        <stop offset="0.09" stop-color="#ffffff" stop-opacity="0.62"/>
        <stop offset="0.32" stop-color="#dbeafe" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="lampGlowRight" cx="78%" cy="15%" r="28%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
        <stop offset="0.09" stop-color="#ffffff" stop-opacity="0.62"/>
        <stop offset="0.32" stop-color="#dbeafe" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="beamLeft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>
        <stop offset="0.7" stop-color="#ffffff" stop-opacity="0.025"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="beamRight" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>
        <stop offset="0.7" stop-color="#ffffff" stop-opacity="0.025"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="accentSlash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.88"/>
        <stop offset="1" stop-color="${accentDeep}" stop-opacity="0.18"/>
      </linearGradient>
      <filter id="badgeShadow"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000000" flood-opacity="0.75"/></filter>
      <filter id="scoreShadow"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.72"/></filter>
    </defs>

    <rect width="1280" height="720" fill="url(#nightSky)"/>

    <!-- Stadium lights and beams -->
    <g id="thumbnailFloodlights">
      <polygon points="250,70 314,70 620,520 440,520" fill="url(#beamLeft)"/>
      <polygon points="1030,62 966,62 660,520 840,520" fill="url(#beamRight)"/>
      <rect width="1280" height="400" fill="url(#lampGlowLeft)"/>
      <rect width="1280" height="400" fill="url(#lampGlowRight)"/>

      <path d="M282 315 L291 103 L297 103 L293 315 Z" fill="#64748b" fill-opacity="0.75"/>
      <rect x="261" y="84" width="68" height="24" rx="4" fill="#475569" stroke="#cbd5e1" stroke-opacity="0.55"/>
      <g fill="#ffffff">
        <circle cx="271" cy="94" r="3.6"/><circle cx="284" cy="94" r="3.6"/><circle cx="297" cy="94" r="3.6"/><circle cx="310" cy="94" r="3.6"/><circle cx="323" cy="94" r="3.6"/>
        <circle cx="271" cy="102" r="3.6"/><circle cx="284" cy="102" r="3.6"/><circle cx="297" cy="102" r="3.6"/><circle cx="310" cy="102" r="3.6"/><circle cx="323" cy="102" r="3.6"/>
      </g>

      <path d="M998 315 L989 95 L983 95 L987 315 Z" fill="#64748b" fill-opacity="0.75"/>
      <rect x="951" y="76" width="68" height="24" rx="4" fill="#475569" stroke="#cbd5e1" stroke-opacity="0.55"/>
      <g fill="#ffffff">
        <circle cx="961" cy="86" r="3.6"/><circle cx="974" cy="86" r="3.6"/><circle cx="987" cy="86" r="3.6"/><circle cx="1000" cy="86" r="3.6"/><circle cx="1013" cy="86" r="3.6"/>
        <circle cx="961" cy="94" r="3.6"/><circle cx="974" cy="94" r="3.6"/><circle cx="987" cy="94" r="3.6"/><circle cx="1000" cy="94" r="3.6"/><circle cx="1013" cy="94" r="3.6"/>
      </g>
    </g>

    <!-- Stadium bowl and crowd -->
    <path d="M0 300 Q170 242 330 260 Q640 186 950 260 Q1110 242 1280 300 L1280 468 Q1085 412 928 426 Q640 372 352 426 Q195 412 0 468 Z" fill="#050a08"/>
    <path d="M0 323 Q175 270 340 284 Q640 220 940 284 Q1105 270 1280 323 L1280 405 Q1090 364 930 376 Q640 332 350 376 Q190 364 0 405 Z" fill="#101b17"/>
    <path d="M0 338 Q180 292 348 301 Q640 247 932 301 Q1100 292 1280 338" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="3"/>
    <g fill="#d1fae5" opacity="0.34">
      ${Array.from({ length: 48 }, (_, i) => {
        const x = 18 + i * 27;
        const y = 335 + (i % 4) * 11;
        return `<circle cx="${x}" cy="${y}" r="1.9"/>`;
      }).join("")}
      ${Array.from({ length: 42 }, (_, i) => {
        const x = 48 + i * 30;
        const y = 383 + ((i + 2) % 4) * 9;
        return `<circle cx="${x}" cy="${y}" r="1.55"/>`;
      }).join("")}
    </g>

    <!-- Perspective pitch -->
    <path d="M155 720 L1125 720 L875 392 L405 392 Z" fill="url(#pitchGrad)" stroke="#9fffdc" stroke-opacity="0.36" stroke-width="2.5"/>
    <path d="M640 392 L640 720 M405 392 L155 720 M875 392 L1125 720" fill="none" stroke="#d1fae5" stroke-opacity="0.24" stroke-width="2"/>
    <ellipse cx="640" cy="555" rx="104" ry="59" fill="none" stroke="#d1fae5" stroke-opacity="0.24" stroke-width="2"/>
    <path d="M450 720 L492 620 L788 620 L830 720 M520 392 L548 455 L732 455 L760 392" fill="none" stroke="#d1fae5" stroke-opacity="0.20" stroke-width="2"/>
    <path d="M350 720 L405 645 L510 645 L475 720 M930 720 L875 645 L770 645 L805 720" fill="none" stroke="#d1fae5" stroke-opacity="0.17" stroke-width="2"/>

    <!-- Broadcast scorebar -->
    <g filter="url(#scoreShadow)">
      <rect x="38" y="34" width="704" height="92" rx="22" fill="#020806" fill-opacity="0.92" stroke="${accent}" stroke-width="2.5"/>
      <rect x="52" y="54" width="64" height="50" rx="25" fill="${accent}"/>
      ${badgeImage(firstBadge, 134, 45, 70, input.fixture.firstTeam.name)}
      <rect x="316" y="48" width="172" height="64" rx="17" fill="#07110d" stroke="${accent}" stroke-width="2"/>
      ${badgeImage(secondBadge, 642, 45, 70, input.fixture.secondTeam.name)}
    </g>

    ${logoImage(sixflTvLogoBytes, 956, 30, 270, 86, 0.97)}

    <!-- Bottom broadcast treatment -->
    <polygon points="0,720 0,630 490,560 640,720" fill="#020504" fill-opacity="0.90"/>
    <polygon points="1280,720 1280,560 870,720" fill="${accentDeep}" fill-opacity="0.78"/>
    <polygon points="1280,720 1280,620 972,720" fill="url(#accentSlash)" opacity="0.72"/>
    <rect y="575" width="1280" height="145" fill="url(#lowerShade)"/>
  </svg>`;

  const textJobs = [
    thumbnailTextPng({ text: "FT", width: 64, height: 50, fontSize: 21, bold: true, fill: "#03110b", align: "center" }),
    thumbnailTextPng({ text: firstCode, width: 94, height: 48, fontSize: 29, bold: true, fill: "#ffffff", align: "center", letterSpacing: 1.3 }),
    thumbnailTextPng({
      markup: scoreVisible
        ? `<span foreground="#ffffff">${firstScore}</span><span foreground="${accent}"> - </span><span foreground="#ffffff">${secondScore}</span>`
        : `<span foreground="#ffffff">VS</span>`,
      width: 172,
      height: 64,
      fontSize: scoreVisible ? 46 : 40,
      bold: true,
      fill: "#ffffff",
      align: "center",
    }),
    thumbnailTextPng({ text: secondCode, width: 94, height: 48, fontSize: 29, bold: true, fill: "#ffffff", align: "center", letterSpacing: 1.3 }),
    thumbnailTextPng({ text: typeLabel, width: 210, height: 36, fontSize: 20, bold: true, fill: accent, letterSpacing: 1.8 }),
    thumbnailTextPng({ text: headlineLineOne, width: 760, height: 92, fontSize: 76, bold: true, fill: "#ffffff" }),
    thumbnailTextPng({ text: headlineLineTwo || " ", width: 820, height: 92, fontSize: 76, bold: true, fill: accent }),
    thumbnailTextPng({ text: matchup, width: 790, height: 38, fontSize: 23, bold: true, fill: "#ffffff" }),
    thumbnailTextPng({ text: league, width: 720, height: 34, fontSize: 21, bold: true, fill: "#ffffff" }),
    thumbnailTextPng({ text: date, width: 420, height: 34, fontSize: 21, bold: true, fill: "#d1d5db", align: "right" }),
  ];

  const [ftText, firstCodeText, scoreText, secondCodeText, typeText, headlineOneText, headlineTwoText, matchupText, leagueText, dateText] = await Promise.all(textJobs);
  const composites: sharp.OverlayOptions[] = [
    { input: ftText, left: 52, top: 54 },
    { input: firstCodeText, left: 212, top: 56 },
    { input: scoreText, left: 316, top: 48 },
    { input: secondCodeText, left: 526, top: 56 },
    { input: typeText, left: 52, top: 404 },
    { input: headlineOneText, left: 52, top: 445 },
    { input: headlineTwoText, left: 52, top: 518 },
    { input: matchupText, left: 54, top: 602 },
    { input: leagueText, left: 54, top: 648 },
    { input: dateText, left: 804, top: 648 },
  ];

  return sharp(Buffer.from(svg))
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function createSixflTvVideoCard(input: {
  fixture: SixflTvGraphicFixture;
  mode: "TITLE" | "FULL_TIME";
  label: string;
  siteUrl: string;
}) {
  const [firstBadge, secondBadge, sixflTvLogoBytes, fontCss] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
    sixflTvLogo(input.siteUrl),
    embeddedFontStyle(input.siteUrl),
  ]);
  const scoreVisible = Number.isInteger(input.fixture.firstTeam.score) && Number.isInteger(input.fixture.secondTeam.score);
  const cardHeading = input.mode === "FULL_TIME" ? "FULL TIME" : "MATCH RESULT";
  const firstScorers = scorerLinesForTeam(input.fixture.scorers, input.fixture.firstTeam.name);
  const secondScorers = scorerLinesForTeam(input.fixture.scorers, input.fixture.secondTeam.name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${fontCss}
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 28, 400, 128)}
    <text x="960" y="225" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="60" font-weight="900" fill="#ffffff">${xml(cardHeading)}</text>

    <text x="350" y="300" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="44" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.firstTeam.name, 24))}</text>
    <text x="1570" y="300" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="44" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.secondTeam.name, 24))}</text>
    <g filter="url(#shadow)">${badgeImage(firstBadge, 220, 330, 260, input.fixture.firstTeam.name)}${badgeImage(secondBadge, 1440, 330, 260, input.fixture.secondTeam.name)}</g>

    ${scoreVisible ? `<g>
      <text x="820" y="520" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="170" font-weight="900" fill="#ffffff">${input.fixture.firstTeam.score}</text>
      <text x="960" y="505" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="92" font-weight="800" fill="#34d399">–</text>
      <text x="1100" y="520" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="170" font-weight="900" fill="#ffffff">${input.fixture.secondTeam.score}</text>
    </g>` : `<text x="960" y="520" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="92" font-weight="900" fill="#ffffff">VS</text>`}
    ${firstScorers.map((line, index) => `<g><text x="690" y="${570 + index * 31}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="23" font-weight="900" fill="#34d399">•</text><text x="716" y="${570 + index * 31}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="21" font-weight="650" fill="#d1fae5">${xml(line)}</text></g>`).join("")}
    ${secondScorers.map((line, index) => `<g><text x="1015" y="${570 + index * 31}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="23" font-weight="900" fill="#34d399">•</text><text x="1041" y="${570 + index * 31}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="21" font-weight="650" fill="#d1fae5">${xml(line)}</text></g>`).join("")}

    <text x="350" y="710" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="21" font-weight="800" letter-spacing="3" fill="#a7f3d0">RECENT FORM</text>
    ${formRun(input.fixture.firstTeamForm, 220, 735, "start")}
    <text x="1570" y="710" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="21" font-weight="800" letter-spacing="3" fill="#a7f3d0">RECENT FORM</text>
    ${formRun(input.fixture.secondTeamForm, 1700, 735, "end")}

    <text x="960" y="870" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="34" font-weight="700" fill="#a7f3d0">${xml(fit(input.fixture.leagueName, 56))}</text>
    <text x="960" y="922" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="28" font-weight="600" fill="#d1d5db">${xml(input.fixture.kickoffLabel)}</text>
    ${input.fixture.decisionNote ? `<text x="960" y="944" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="24" font-weight="700" fill="#fcd34d">${xml(fit(input.fixture.decisionNote, 90))}</text>` : ""}
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvGoalOfMonthCard(input: { siteUrl: string; fixture: SixflTvGraphicFixture }) {
  const destination = new URL("/goal-of-the-month", input.siteUrl);
  const displayUrl = `${destination.host.replace(/^www\./, "")}${destination.pathname}`;
  const sourceDate = input.fixture.kickoffIso ? new Date(input.fixture.kickoffIso) : new Date();
  const validDate = Number.isFinite(sourceDate.getTime()) ? sourceDate : new Date();
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/London" }).format(validDate);
  const monthUpper = month.toUpperCase();
  const [sixflTvLogoBytes, fontCss] = await Promise.all([sixflTvLogo(input.siteUrl), embeddedFontStyle(input.siteUrl)]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${fontCss}
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 36, 400, 128)}
    <text x="960" y="300" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="82" font-weight="900" fill="#ffffff">${xml(monthUpper)} GOAL OF THE MONTH</text>
    <text x="960" y="390" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="42" font-weight="800" fill="#d1fae5">Think one of these deserves it?</text>
    <rect x="470" y="485" width="980" height="190" rx="34" fill="#020805" fill-opacity="0.72" stroke="#34d399" stroke-width="5"/>
    <text x="960" y="565" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="42" font-weight="900" fill="#ffffff">NOMINATE &amp; VOTE</text>
    <text x="960" y="630" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="34" font-weight="700" fill="#6ee7b7">${xml(displayUrl)}</text>
    <text x="960" y="775" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="28" font-weight="700" fill="#ffffff">Nominate until 5 ${xml(month)} · Vote 6–12 ${xml(month)}</text>
    <text x="960" y="835" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="24" font-weight="600" fill="#d1d5db">Player chosen · ${xml(month)} winner announced from 13 ${xml(month)}</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function createSixflTvScoreBug(input: { fixture: SixflTvGraphicFixture; kind: "HIGHLIGHTS" | "FULL_MATCH"; siteUrl: string }) {
  const [firstBadge, secondBadge, sixflTvLogoBytes, fontCss] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
    sixflTvLogo(input.siteUrl),
    embeddedFontStyle(input.siteUrl),
  ]);
  const firstScore = input.fixture.firstTeam.score;
  const secondScore = input.fixture.secondTeam.score;
  if (!Number.isInteger(firstScore) || !Number.isInteger(secondScore)) throw new Error("A confirmed final score is required for the SIXFL TV scorebug.");
  const firstCode = broadcastCodeForTeam(input.fixture.firstTeam);
  const secondCode = broadcastCodeForTeam(input.fixture.secondTeam);
  const footageLabel = input.kind === "HIGHLIGHTS" ? "Match highlights" : "Full match";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <filter id="scorebugShadow"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000000" flood-opacity="0.58"/></filter>
      <linearGradient id="scorebugBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#03100b" stop-opacity="0.96"/>
        <stop offset="1" stop-color="#010604" stop-opacity="0.94"/>
      </linearGradient>
    </defs>
    ${fontCss}
    <g transform="translate(54 42)" filter="url(#scorebugShadow)">
      <rect width="690" height="94" rx="17" fill="url(#scorebugBg)" stroke="#2dd4bf" stroke-width="2.5"/>
      <rect x="14" y="28" width="54" height="38" rx="19" fill="#10b981"/>
      <text x="41" y="54" text-anchor="middle" font-size="17" font-weight="900" fill="#02140d" letter-spacing="1">FT</text>

      <g transform="translate(82 14)">${badgeImage(firstBadge, 0, 0, 66, input.fixture.firstTeam.name)}</g>
      <text x="190" y="59" text-anchor="middle" font-size="27" font-weight="900" fill="#ffffff" letter-spacing="2">${xml(firstCode)}</text>

      <rect x="262" y="15" width="150" height="64" rx="15" fill="#06150f" stroke="#10b981" stroke-width="2"/>
      <text x="337" y="60" text-anchor="middle" font-size="41" font-weight="900" fill="#ffffff">${firstScore}<tspan fill="#34d399"> - </tspan>${secondScore}</text>

      <text x="486" y="59" text-anchor="middle" font-size="27" font-weight="900" fill="#ffffff" letter-spacing="2">${xml(secondCode)}</text>
      <g transform="translate(568 14)">${badgeImage(secondBadge, 0, 0, 66, input.fixture.secondTeam.name)}</g>
    </g>
    <g transform="translate(54 146)">
      <rect width="190" height="38" rx="19" fill="#020805" fill-opacity="0.76" stroke="#2dd4bf" stroke-opacity="0.5"/>
      <text x="95" y="26" text-anchor="middle" font-size="18" font-weight="800" fill="#d1fae5">${xml(footageLabel)}</text>
    </g>
    ${logoImage(sixflTvLogoBytes, 1585, 34, 275, 88, 0.94)}
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function createSixflTvLeagueTableCard(input: {
  fixture: SixflTvGraphicFixture;
  page: "TOP" | "BOTTOM";
  siteUrl: string;
}) {
  const table = input.fixture.leagueTable;
  if (!table?.rows?.length) return null;

  const midpoint = Math.ceil(table.rows.length / 2);
  const rows = input.page === "TOP" ? table.rows.slice(0, midpoint) : table.rows.slice(midpoint);
  if (!rows.length) return null;

  const [sixflTvLogoBytes, fontCss] = await Promise.all([
    sixflTvLogo(input.siteUrl),
    embeddedFontStyle(input.siteUrl),
  ]);
  const currentTeamIds = new Set([
    input.fixture.firstTeam.name.toLowerCase(),
    input.fixture.secondTeam.name.toLowerCase(),
  ]);
  const rowHeight = Math.min(78, Math.floor(520 / Math.max(1, rows.length)));
  const startY = 392;
  const tableRows = rows.map((row, index) => {
    const y = startY + index * rowHeight;
    const highlighted = currentTeamIds.has(row.teamName.toLowerCase());
    const bg = highlighted
      ? `<rect x="180" y="${y - 39}" width="1560" height="${rowHeight - 5}" rx="16" fill="#10b981" fill-opacity="0.16" stroke="#34d399" stroke-opacity="0.48" stroke-width="2"/>`
      : `<rect x="180" y="${y - 39}" width="1560" height="${rowHeight - 5}" rx="16" fill="#ffffff" fill-opacity="${index % 2 === 0 ? "0.045" : "0.025"}"/>`;
    const movement =
      row.movement === "UP" ? { symbol: "↑", colour: "#6ee7b7" } :
      row.movement === "DOWN" ? { symbol: "↓", colour: "#fca5a5" } :
      row.movement === "SAME" ? { symbol: "→", colour: "#94a3b8" } :
      { symbol: "•", colour: "#475569" };
    return `<g>
      ${bg}
      <text x="235" y="${y}" font-size="29" font-weight="900" fill="${highlighted ? "#6ee7b7" : "#ffffff"}">${row.position}</text>
      <text x="292" y="${y}" text-anchor="middle" font-size="30" font-weight="900" fill="${movement.colour}">${movement.symbol}</text>
      <text x="360" y="${y}" font-size="31" font-weight="${highlighted ? "900" : "700"}" fill="#ffffff">${xml(fit(row.teamName, 32))}</text>
      <text x="1270" y="${y}" text-anchor="middle" font-size="27" font-weight="700" fill="#d1d5db">${row.played}</text>
      <text x="1450" y="${y}" text-anchor="middle" font-size="27" font-weight="700" fill="${row.goalDifference >= 0 ? "#a7f3d0" : "#fca5a5"}">${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</text>
      <text x="1640" y="${y}" text-anchor="middle" font-size="31" font-weight="900" fill="#ffffff">${row.points}</text>
    </g>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${fontCss}
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 790, 18, 340, 108)}
    <text x="960" y="180" text-anchor="middle" font-size="58" font-weight="900" fill="#ffffff">LEAGUE TABLE</text>
    <text x="960" y="228" text-anchor="middle" font-size="25" font-weight="800" letter-spacing="4" fill="#a7f3d0">${input.page === "TOP" ? "TOP HALF" : "BOTTOM HALF"}</text>
    <text x="960" y="276" text-anchor="middle" font-size="23" font-weight="700" fill="#d1d5db">${xml(fit(table.title, 68))}</text>
    <line x1="180" y1="304" x2="1740" y2="304" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>

    <text x="235" y="344" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">POS</text>
    <text x="292" y="344" text-anchor="middle" font-size="18" font-weight="800" fill="#94a3b8">↕</text>
    <text x="360" y="344" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">TEAM</text>
    <text x="1270" y="344" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">P</text>
    <text x="1450" y="344" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">GD</text>
    <text x="1640" y="344" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">PTS</text>
    ${tableRows}
    <text x="960" y="988" text-anchor="middle" font-size="23" font-weight="600" fill="#d1d5db">Table updated after this match</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
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


export async function createSixflTvPredictorCard(input: { fixture: SixflTvGraphicFixture; siteUrl: string }) {
  const predictor = input.fixture.predictor;
  if (!predictor) return null;
  const [firstBadge, secondBadge, sixflTvLogoBytes, predictorLogoBytes, fontCss] = await Promise.all([
    fetchSixflTvBadge(input.fixture.firstTeam.logoUrl, input.siteUrl),
    fetchSixflTvBadge(input.fixture.secondTeam.logoUrl, input.siteUrl),
    sixflTvLogo(input.siteUrl),
    sixflPredictorLogo(input.siteUrl),
    embeddedFontStyle(input.siteUrl),
  ]);
  const headline = fit(predictor.headline || "Pre-match prediction", 62);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${fontCss}
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 80, 52, 300, 96)}
    ${logoImage(predictorLogoBytes, 640, 70, 640, 150)}
    <text x="960" y="265" text-anchor="middle" font-size="26" font-weight="900" letter-spacing="5" fill="#a7f3d0">PRE-MATCH PREDICTION</text>

    <g filter="url(#shadow)">
      ${badgeImage(firstBadge, 220, 350, 300, input.fixture.firstTeam.name)}
      ${badgeImage(secondBadge, 1400, 350, 300, input.fixture.secondTeam.name)}
    </g>

    <text x="370" y="720" text-anchor="middle" font-size="48" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.firstTeam.name, 26))}</text>
    <text x="1550" y="720" text-anchor="middle" font-size="48" font-weight="900" fill="#ffffff">${xml(fit(input.fixture.secondTeam.name, 26))}</text>

    <g filter="url(#shadow)">
      <rect x="675" y="360" width="570" height="280" rx="42" fill="#020805" fill-opacity="0.88" stroke="#34d399" stroke-width="5"/>
      <text x="960" y="475" text-anchor="middle" font-size="148" font-weight="900" fill="#ffffff">${predictor.firstTeamScore}<tspan fill="#34d399"> - </tspan>${predictor.secondTeamScore}</text>
      <text x="960" y="550" text-anchor="middle" font-size="28" font-weight="800" fill="#d1fae5">${xml(headline)}</text>
      <text x="960" y="602" text-anchor="middle" font-size="20" font-weight="700" letter-spacing="3" fill="#6ee7b7">PREDICTED BEFORE KICK-OFF</text>
    </g>

    <text x="960" y="860" text-anchor="middle" font-size="34" font-weight="700" fill="#a7f3d0">${xml(fit(input.fixture.leagueName, 58))}</text>
    <text x="960" y="914" text-anchor="middle" font-size="28" font-weight="600" fill="#d1d5db">${xml(input.fixture.kickoffLabel)}</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}


export async function createSixflTvLineupCard(input: { fixture: SixflTvGraphicFixture; siteUrl: string }) {
  const first = (input.fixture.firstTeamLineup || []).slice(0, 12);
  const second = (input.fixture.secondTeamLineup || []).slice(0, 12);
  if (!first.length && !second.length) return null;
  const [sixflTvLogoBytes, predictorLogoBytes, fontCss] = await Promise.all([sixflTvLogo(input.siteUrl), sixflPredictorLogo(input.siteUrl), embeddedFontStyle(input.siteUrl)]);
  const predictor = input.fixture.predictor;
  const rows = Math.max(first.length, second.length, 1);
  const teamNameY = predictor ? 470 : 330;
  const startY = predictor ? 535 : 395;
  const rowGap = Math.min(46, Math.floor((predictor ? 365 : 500) / rows));
  const list = (items: string[], x: number) => items.map((name, index) => {
    const y = startY + index * rowGap;
    return `<g><text x="${x}" y="${y}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="28" font-weight="900" fill="#34d399">•</text><text x="${x + 28}" y="${y}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${xml(fit(name, 30))}</text></g>`;
  }).join("");
  const predictorPanel = predictor
    ? `<g>
        <rect x="710" y="230" width="500" height="190" rx="28" fill="#020805" fill-opacity="0.82" stroke="#34d399" stroke-width="3"/>
        ${logoImage(predictorLogoBytes, 825, 244, 270, 68)}
        <text x="960" y="342" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="18" font-weight="800" letter-spacing="3" fill="#a7f3d0">PRE-MATCH PREDICTION</text>
        <text x="960" y="402" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="52" font-weight="900" fill="#ffffff">${predictor.firstTeamScore} <tspan fill="#34d399">–</tspan> ${predictor.secondTeamScore}</text>
      </g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    ${fontCss}
    ${stadiumBackground(1920, 1080)}
    ${logoImage(sixflTvLogoBytes, 760, 24, 400, 128)}
    <text x="960" y="205" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="58" font-weight="900" fill="#ffffff">MATCHDAY SQUADS</text>
    ${predictorPanel}
    <text x="480" y="${teamNameY}" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="40" font-weight="900" fill="#6ee7b7">${xml(fit(input.fixture.firstTeam.name, 28))}</text>
    <text x="1440" y="${teamNameY}" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="40" font-weight="900" fill="#6ee7b7">${xml(fit(input.fixture.secondTeam.name, 28))}</text>
    <line x1="960" y1="${teamNameY - 10}" x2="960" y2="910" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
    ${list(first, 250)}
    ${list(second, 1210)}
    <text x="960" y="972" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="25" font-weight="600" fill="#d1d5db">${xml(fit(input.fixture.leagueName, 62))} · ${xml(input.fixture.kickoffLabel)}</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
