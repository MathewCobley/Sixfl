const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function cleanVideoId(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

export function getYouTubeVideoId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  const directId = cleanVideoId(raw);
  if (directId) return directId;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      return cleanVideoId(pathParts[0]);
    }

    const youtubeHosts = new Set([
      "youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
    ]);

    if (!youtubeHosts.has(host)) return null;

    if (parsed.pathname === "/watch") {
      return cleanVideoId(parsed.searchParams.get("v"));
    }

    if (["shorts", "embed", "live"].includes(pathParts[0] ?? "")) {
      return cleanVideoId(pathParts[1]);
    }

    return null;
  } catch {
    return null;
  }
}

export function canonicalYouTubeUrl(value: string | null | undefined) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function youtubeEmbedUrl(videoId: string) {
  const safeId = cleanVideoId(videoId);
  return safeId
    ? `https://www.youtube-nocookie.com/embed/${safeId}?rel=0&modestbranding=1`
    : null;
}
