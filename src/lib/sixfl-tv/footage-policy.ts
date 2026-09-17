// Shared by the admin uploader and server. Uploading never publishes a video.
export const FOOTAGE_PART_BYTES = 8 * 1024 * 1024;
export const FOOTAGE_STORAGE_LIMIT_BYTES = 100 * 1024 ** 3;
export const FOOTAGE_KINDS = ["CLIP", "HIGHLIGHTS", "FULL_MATCH", "INTRO", "OUTRO"] as const;
export type FootageKind = (typeof FOOTAGE_KINDS)[number];
export const FOOTAGE_LIMITS: Record<FootageKind, number> = {
  CLIP: 1024 ** 3,
  HIGHLIGHTS: 2 * 1024 ** 3,
  FULL_MATCH: 8 * 1024 ** 3,
  INTRO: 250 * 1024 ** 2,
  OUTRO: 250 * 1024 ** 2,
};
export class FootageError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "FootageError";
  }
}
export function footageId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value)) {
    throw new FootageError("The footage or fixture reference is invalid.");
  }
  return value;
}
export function footageSpec(data: Record<string, unknown>) {
  if (typeof data.kind !== "string" || !FOOTAGE_KINDS.includes(data.kind as FootageKind)) {
    throw new FootageError("Choose clips, highlights, full match, intro or outro.");
  }
  const kind = data.kind as FootageKind;
  const sizeBytes = data.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > FOOTAGE_LIMITS[kind]) {
    throw new FootageError("This file is empty or exceeds the upload limit for this video type.", 413);
  }
  if (typeof data.filename !== "string" || data.filename.length > 255 || !/\.mp4$/i.test(data.filename) || /[\x00-\x1f\x7f/\\]/.test(data.filename)) {
    throw new FootageError("Choose an MP4 video file with a valid filename.");
  }
  if (typeof data.lastModified !== "number" || !Number.isSafeInteger(data.lastModified) || data.lastModified < 0) {
    throw new FootageError("The selected file could not be identified.");
  }
  return { kind, sizeBytes, filename: data.filename, lastModified: data.lastModified,
    partCount: Math.ceil(sizeBytes / FOOTAGE_PART_BYTES) };
}
export function expectedFootagePartBytes(sizeBytes: number, partNumber: number): number {
  const count = Math.ceil(sizeBytes / FOOTAGE_PART_BYTES);
  if (!Number.isSafeInteger(partNumber) || partNumber < 0 || partNumber >= count) {
    throw new FootageError("The upload part number is invalid.");
  }
  return Math.min(FOOTAGE_PART_BYTES, sizeBytes - partNumber * FOOTAGE_PART_BYTES);
}
export function looksLikeMp4(bytes: Uint8Array): boolean {
  // Only a container signature check, not a promise that all video codecs are playable.
  return bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}
