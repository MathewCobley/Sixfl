/** Shared browser/server limits for website image uploads. */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_TYPES.join(",");
