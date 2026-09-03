export type SixflTvVideoSet = {
  highlights: string | null;
  fullMatch: string | null;
  extras: string[];
};

export type SixflTvVideo = {
  kind: "HIGHLIGHTS" | "FULL_MATCH" | "EXTRA";
  url: string;
  label: string;
};

type StoredVideoSetV2 = {
  v: 2;
  highlights?: string | null;
  fullMatch?: string | null;
  extras?: string[];
};

export function normaliseSixflTvUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function unique(values: Array<string | null | undefined>) {
  const result: string[] = [];
  for (const value of values) {
    const normalised = normaliseSixflTvUrl(value);
    if (normalised && !result.includes(normalised)) result.push(normalised);
  }
  return result;
}

export function emptySixflTvVideoSet(): SixflTvVideoSet {
  return { highlights: null, fullMatch: null, extras: [] };
}

export function parseSixflTvVideoValue(value: string | null | undefined): SixflTvVideoSet {
  const original = value ?? "";
  const trimmed = original.trim();
  if (!trimmed) return emptySixflTvVideoSet();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as StoredVideoSetV2;
      if (parsed?.v === 2) {
        const highlights = normaliseSixflTvUrl(parsed.highlights);
        const fullMatch = normaliseSixflTvUrl(parsed.fullMatch);
        const extras = unique(Array.isArray(parsed.extras) ? parsed.extras : []).filter(
          (url) => url !== highlights && url !== fullMatch,
        );
        return { highlights, fullMatch, extras };
      }
    } catch {
      // Fall through to the line-based format.
    }
  }

  // Line positions are meaningful. A leading blank line means there are no
  // highlights and line 2 is a full-match-only video.
  const rawLines = original.includes("\n")
    ? original.replace(/\r/g, "").split("\n")
    : original.split(",");
  const lines = rawLines.map((line) => normaliseSixflTvUrl(line));
  const highlights = lines[0] ?? null;
  const fullMatch = lines[1] ?? null;
  const extras = unique(rawLines.slice(2)).filter(
    (url) => url !== highlights && url !== fullMatch,
  );

  return { highlights, fullMatch, extras };
}

export function getSixflTvVideos(value: string | null | undefined): SixflTvVideo[] {
  const parsed = parseSixflTvVideoValue(value);
  const videos: SixflTvVideo[] = [];

  if (parsed.highlights) {
    videos.push({ kind: "HIGHLIGHTS", url: parsed.highlights, label: "Match highlights" });
  }
  if (parsed.fullMatch) {
    videos.push({ kind: "FULL_MATCH", url: parsed.fullMatch, label: "Full match" });
  }
  parsed.extras.forEach((url, index) => {
    videos.push({ kind: "EXTRA", url, label: `Extra clip ${index + 1}` });
  });

  return videos;
}

export function getFirstSixflTvUrl(value: string | null | undefined) {
  return getSixflTvVideos(value)[0]?.url ?? null;
}

export function buildSixflTvVideoValue(input: {
  highlights?: string | null;
  fullMatch?: string | null;
  extras?: string | string[] | null;
}) {
  const rawExtras = Array.isArray(input.extras)
    ? input.extras
    : String(input.extras ?? "").split(/[\n,]+/);

  const supplied = [input.highlights, input.fullMatch, ...rawExtras].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  if (supplied.some((value) => !normaliseSixflTvUrl(value))) {
    return { ok: false as const, value: null, count: 0, videos: [] as SixflTvVideo[] };
  }

  const highlights = normaliseSixflTvUrl(input.highlights);
  const fullMatch = normaliseSixflTvUrl(input.fullMatch);
  const extras = unique(rawExtras).filter((url) => url !== highlights && url !== fullMatch);

  if (!highlights && !fullMatch && extras.length === 0) {
    return { ok: true as const, value: null, count: 0, videos: [] as SixflTvVideo[] };
  }

  const slots = [highlights ?? "", fullMatch ?? "", ...extras];
  while (slots.length > 0 && !slots[slots.length - 1]) slots.pop();
  const storedValue = slots.join("\n");
  const videos = getSixflTvVideos(storedValue);

  return { ok: true as const, value: storedValue, count: videos.length, videos };
}

export function normaliseExistingSixflTvVideoValue(value: string | null | undefined) {
  const original = value ?? "";
  if (!original.trim()) return buildSixflTvVideoValue({});

  const trimmed = original.trim();
  if (!trimmed.startsWith("{")) {
    const rawParts = original.includes("\n")
      ? original.replace(/\r/g, "").split("\n")
      : original.split(",");
    const invalid = rawParts
      .filter((part) => part.trim())
      .some((part) => !normaliseSixflTvUrl(part));
    if (invalid) {
      return { ok: false as const, value: null, count: 0, videos: [] as SixflTvVideo[] };
    }
  }

  return buildSixflTvVideoValue(parseSixflTvVideoValue(original));
}
