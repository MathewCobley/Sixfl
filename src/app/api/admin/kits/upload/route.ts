// ========================================
// File: src/app/api/admin/kits/upload/route.ts
// ========================================

import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  normaliseKitCode,
  upsertKitDesignImage,
} from "@/lib/kits/db";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function fileCode(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return normaliseKitCode(baseName);
}

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No image file was supplied." },
        { status: 400 },
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Use a PNG, JPEG or WebP image." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Each image must be no larger than 5 MB." },
        { status: 400 },
      );
    }

    const suppliedCode = String(formData.get("code") ?? "").trim();
    const code = normaliseKitCode(suppliedCode || fileCode(file.name));

    if (!code) {
      return NextResponse.json(
        {
          ok: false,
          error: "The filename must contain a usable kit code.",
        },
        { status: 400 },
      );
    }

    const source = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(source, { failOn: "error" }).rotate();

    const imageData = await pipeline
      .clone()
      .resize({
        width: 900,
        height: 900,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();

    const thumbnailData = await pipeline
      .clone()
      .resize({
        width: 360,
        height: 360,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    const design = await upsertKitDesignImage({
      code,
      name: `Kit ${code}`,
      imageData,
      imageMimeType: "image/webp",
      thumbnailData,
      thumbnailMimeType: "image/webp",
    });

    return NextResponse.json({ ok: true, design });
  } catch (error) {
    console.error("Kit image upload failed", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The kit image could not be uploaded.",
      },
      { status: 500 },
    );
  }
}
