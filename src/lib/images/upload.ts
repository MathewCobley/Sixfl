import sharp from "sharp";
import { IMAGE_UPLOAD_TYPES, MAX_IMAGE_UPLOAD_BYTES } from "./constants";

const MAX_FORM_BYTES = MAX_IMAGE_UPLOAD_BYTES + 64 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const SUPPORTED_FORMATS = new Set(["png", "jpeg", "webp"]);

export class ImageUploadError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ImageUploadError";
  }
}

/** Bound the whole request, including chunked requests, before parsing multipart. */
export async function readImageUploadForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ImageUploadError("Please choose an image using the upload form.");
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_FORM_BYTES) {
    throw new ImageUploadError("Each image must be no larger than 5 MB.", 413);
  }
  if (!request.body) throw new ImageUploadError("No image was supplied.");

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        throw new ImageUploadError("Each image must be no larger than 5 MB.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ImageUploadError("The upload could not be read. Please choose the image again.");
  }
}

export type OptimisedBadgeImage = {
  imageData: Buffer;
  thumbnailData: Buffer;
};

/** Decode, orient, resize and re-encode; never serve the original uploaded bytes. */
export async function optimiseBadgeImage(file: File): Promise<OptimisedBadgeImage> {
  if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageUploadError("Use a PNG, JPEG or WebP image.");
  }
  if (file.size <= 0) throw new ImageUploadError("The image file is empty.");
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageUploadError("Each image must be no larger than 5 MB.", 413);
  }

  try {
    const source = Buffer.from(await file.arrayBuffer());
    // Reject renamed SVG/GIF files before passing any input to the image decoder.
    const isPng = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff;
    const isWebp = source.toString("ascii", 0, 4) === "RIFF" && source.toString("ascii", 8, 12) === "WEBP";
    if (!isPng && !isJpeg && !isWebp) {
      throw new ImageUploadError("Use a real PNG, JPEG or WebP image, not an SVG or renamed file.");
    }
    const pipeline = sharp(source, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await pipeline.metadata();
    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
      throw new ImageUploadError("Use a real PNG, JPEG or WebP image, not an SVG or renamed file.");
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new ImageUploadError("Use a still image rather than an animated badge.");
    }
    const oriented = pipeline.rotate();
    const [imageData, thumbnailData] = await Promise.all([
      oriented.clone().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88, effort: 4 }).toBuffer(),
      oriented.clone().resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 }).toBuffer(),
    ]);
    return { imageData, thumbnailData };
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError("This image could not be processed. Try a PNG, JPEG or WebP under 5 MB and 25 megapixels.");
  }
}
