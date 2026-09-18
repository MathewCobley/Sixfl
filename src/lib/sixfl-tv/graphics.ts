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
      dpi: 72,
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
  const headline = fit(input.headline || (input.kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH"), 24).toUpperCase();
  const strapline = fit(input.strapline || input.fixture.leagueName, 52);
  const league = fit(input.fixture.leagueName.replaceAll("·", "|"), 52);
  const firstName = fit(input.fixture.firstTeam.name, 22);
  const secondName = fit(input.fixture.secondTeam.name, 22);
  const isHighlights = input.kind === "HIGHLIGHTS";
  const accent = isHighlights ? "#23d18b" : "#ff3b5c";
  const accentDark = isHighlights ? "#0b6f4d" : "#8d1730";
  const typeLabel = isHighlights ? "HIGHLIGHTS" : "FULL MATCH";

  const scoreShape = scoreVisible
    ? `<g filter="url(#scoreShadow)">
        <rect x="485" y="326" width="310" height="164" rx="28" fill="#020806" fill-opacity="0.90" stroke="${accent}" stroke-width="3"/>
        <rect x="590" y="303" width="100" height="42" rx="21" fill="${accent}"/>
      </g>`
    : `<g filter="url(#scoreShadow)"><rect x="520" y="340" width="240" height="130" rx="26" fill="#020806" fill-opacity="0.90" stroke="${accent}" stroke-width="3"/></g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="thumbBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020504"/>
        <stop offset="0.48" stop-color="#07120d"/>
        <stop offset="1" stop-color="#020504"/>
      </linearGradient>
      <radialGradient id="centreGlow" cx="50%" cy="48%" r="62%">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
        <stop offset="0.55" stop-color="${accentDark}" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="lightLeft" cx="0%" cy="0%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/><stop offset="0.14" stop-color="#d1fae5" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lightRight" cx="100%" cy="0%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/><stop offset="0.14" stop-color="#d1fae5" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.88"/></linearGradient>
      <filter id="badgeGlow"><feDropShadow dx="0" dy="12" stdDeviation="15" flood-color="#000000" flood-opacity="0.75"/><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${accent}" flood-opacity="0.26"/></filter>
      <filter id="scoreShadow"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000000" flood-opacity="0.72"/></filter>
    </defs>
    <rect width="1280" height="720" fill="url(#thumbBg)"/>
    <rect width="1280" height="720" fill="url(#centreGlow)"/>
    <rect width="520" height="430" fill="url(#lightLeft)"/>
    <rect x="760" width="520" height="430" fill="url(#lightRight)"/>
    <polygon points="0,0 420,0 180,720 0,720" fill="${accent}" opacity="0.055"/>
    <polygon points="1280,0 1035,0 1165,720 1280,720" fill="${accent}" opacity="0.045"/>
    <g opacity="0.30">
      <circle cx="78" cy="70" r="9" fill="#ffffff"/><circle cx="108" cy="58" r="5" fill="#ffffff"/><circle cx="137" cy="74" r="7" fill="#ffffff"/>
      <circle cx="1202" cy="70" r="9" fill="#ffffff"/><circle cx="1172" cy="58" r="5" fill="#ffffff"/><circle cx="1143" cy="74" r="7" fill="#ffffff"/>
    </g>
    <path d="M0 555 Q250 485 490 520 T900 520 T1280 545 L1280 720 L0 720 Z" fill="#020403" opacity="0.86"/>
    <path d="M0 600 L1280 600 M640 540 L640 720 M440 720 L560 560 M840 720 L720 560" stroke="#2dd4bf" stroke-opacity="0.12" stroke-width="3"/>
    <rect y="615" width="1280" height="105" fill="url(#bottomFade)"/>
    <rect x="56" y="44" width="178" height="40" rx="20" fill="${accent}"/>
    ${logoImage(sixflTvLogoBytes, 1000, 30, 224, 78)}
    <rect x="60" y="194" width="450" height="6" rx="3" fill="${accent}"/>
    <g filter="url(#badgeGlow)">
      ${badgeImage(firstBadge, 86, 302, 238, input.fixture.firstTeam.name)}
      ${badgeImage(secondBadge, 956, 302, 238, input.fixture.secondTeam.name)}
    </g>
    ${scoreShape}
    <rect x="54" y="629" width="1172" height="56" rx="18" fill="#000000" fill-opacity="0.58" stroke="#ffffff" stroke-opacity="0.08"/>
  </svg>`;

  const textJobs = [
    thumbnailTextPng({ text: typeLabel, width: 178, height: 40, fontSize: 19, bold: true, fill: "#06110c", align: "center", letterSpacing: 1.8 }),
    thumbnailTextPng({ text: headline, width: 850, height: 92, fontSize: 78, bold: true, fill: "#ffffff" }),
    thumbnailTextPng({ text: strapline, width: 760, height: 38, fontSize: 23, bold: true, fill: "#d1fae5" }),
    thumbnailTextPng({ text: firstName, width: 340, height: 48, fontSize: 31, bold: true, fill: "#ffffff", align: "center" }),
    thumbnailTextPng({ text: secondName, width: 340, height: 48, fontSize: 31, bold: true, fill: "#ffffff", align: "center" }),
    thumbnailTextPng({ text: league, width: 650, height: 38, fontSize: 21, bold: true, fill: "#ffffff" }),
    thumbnailTextPng({ text: input.fixture.kickoffLabel, width: 450, height: 38, fontSize: 21, bold: true, fill: "#d1d5db", align: "right" }),
    scoreVisible
      ? thumbnailTextPng({ text: "FT", width: 100, height: 42, fontSize: 20, bold: true, fill: "#06120d", align: "center", letterSpacing: 1.5 })
      : thumbnailTextPng({ text: "VS", width: 240, height: 92, fontSize: 58, bold: true, fill: "#ffffff", align: "center" }),
    scoreVisible
      ? thumbnailTextPng({
          markup: `<span foreground="#ffffff">${firstScore}</span><span foreground="${accent}"> - </span><span foreground="#ffffff">${secondScore}</span>`,
          width: 310,
          height: 130,
          fontSize: 104,
          bold: true,
          fill: "#ffffff",
          align: "center",
        })
      : Promise.resolve(Buffer.alloc(0)),
  ];

  const [typeText, headlineText, strapText, firstTeamText, secondTeamText, leagueText, dateText, scoreLabelText, scoreText] = await Promise.all(textJobs);
  const composites: sharp.OverlayOptions[] = [
    { input: typeText, left: 56, top: 44 },
    { input: headlineText, left: 60, top: 104 },
    { input: strapText, left: 62, top: 208 },
    { input: firstTeamText, left: 35, top: 548 },
    { input: secondTeamText, left: 905, top: 548 },
    { input: leagueText, left: 82, top: 640 },
    { input: dateText, left: 748, top: 640 },
    { input: scoreLabelText, left: scoreVisible ? 590 : 520, top: scoreVisible ? 303 : 355 },
  ];
  if (scoreVisible && scoreText.length) composites.push({ input: scoreText, left: 485, top: 343 });

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
    ${firstScorers.map((line, index) => `<g><circle cx="712" cy="${561 + index * 30}" r="4" fill="#34d399"/><text x="726" y="${568 + index * 30}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="20" font-weight="600" fill="#d1fae5">${xml(line)}</text></g>`).join("")}
    ${secondScorers.map((line, index) => `<g><circle cx="1012" cy="${561 + index * 30}" r="4" fill="#34d399"/><text x="1026" y="${568 + index * 30}" text-anchor="start" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="20" font-weight="600" fill="#d1fae5">${xml(line)}</text></g>`).join("")}

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

export async function createSixflTvScoreBug(input: { fixture: SixflTvGraphicFixture; siteUrl: string }) {
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
    return `<g>
      ${bg}
      <text x="235" y="${y}" font-size="29" font-weight="900" fill="${highlighted ? "#6ee7b7" : "#ffffff"}">${row.position}</text>
      <text x="330" y="${y}" font-size="31" font-weight="${highlighted ? "900" : "700"}" fill="#ffffff">${xml(fit(row.teamName, 34))}</text>
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
    <text x="330" y="344" font-size="18" font-weight="800" letter-spacing="2" fill="#94a3b8">TEAM</text>
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
  const list = (items: string[], x: number) => items.map((name, index) => `<text x="${x}" y="${startY + index * rowGap}" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${xml(fit(name, 34))}</text>`).join("");
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
    ${list(first, 480)}
    ${list(second, 1440)}
    <text x="960" y="972" text-anchor="middle" font-family="SIXFLInter,DejaVu Sans,sans-serif" font-size="25" font-weight="600" fill="#d1d5db">${xml(fit(input.fixture.leagueName, 62))} · ${xml(input.fixture.kickoffLabel)}</text>
    <rect x="650" y="1018" width="620" height="7" rx="4" fill="#34d399"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
