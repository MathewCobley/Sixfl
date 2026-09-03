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
  const raw = value?.trim();
  if (!raw) return emptySixflTvVideoSet();

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as StoredVideoSetV2;
      if (parsed?.v === 2) {
        const highlights = normaliseSixflTvUrl(parsed.highlights);
        const fullMatch = normaliseSixflTvUrl(parsed.fullMatch);
        const extras = unique(Array.isArray(parsed.extras) ? parsed.extras : []).filter(
          (url) => url !== highlights && url !== fullMatch,
        );
        return { highlights, fullMatch, extras };
      }
    } catch {
      // Fall through to the legacy newline format.
    }
  }

  const legacy = unique(raw.split(/[\n,]+/));
  return {
    highlights: legacy[0] ?? null,
    fullMatch: legacy[1] ?? null,
    extras: legacy.slice(2),
  };
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
  const invalid = supplied.find((value) => !normaliseSixflTvUrl(value));
  if (invalid) {
    return { ok: false as const, value: null, count: 0, videos: [] as SixflTvVideo[] };
  }

  const highlights = normaliseSixflTvUrl(input.highlights);
  const fullMatch = normaliseSixflTvUrl(input.fullMatch);
  const extras = unique(rawExtras).filter((url) => url !== highlights && url !== fullMatch);
  const videos = getSixflTvVideos(
    JSON.stringify({ v: 2, highlights, fullMatch, extras } satisfies StoredVideoSetV2),
  );

  if (videos.length === 0) {
    return { ok: true as const, value: null, count: 0, videos };
  }

  return {
    ok: true as const,
    value: JSON.stringify({ v: 2, highlights, fullMatch, extras } satisfies StoredVideoSetV2),
    count: videos.length,
    videos,
  };
}
