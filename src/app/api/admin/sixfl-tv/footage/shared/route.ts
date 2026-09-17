import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { FootageError, footageId } from "@/lib/sixfl-tv/footage-policy";
import {
  beginFootage,
  checkFootageOrigin,
  finishFootage,
  footageState,
  putFootagePart,
  readFootageBytes,
  readFootageJson,
  removeFootage,
  resumeFootage,
} from "@/lib/sixfl-tv/footage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "private, no-store, max-age=0" };

function failure(error: unknown) {
  if (error instanceof FootageError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  console.error("SIXFL shared footage operation failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json(
    { error: "The shared SIXFL TV file could not be saved. Completed parts are retained; try again shortly." },
    { status: 503, headers },
  );
}

export async function GET(request: Request) {
  await requireAdmin();
  try {
    const assetId = new URL(request.url).searchParams.get("assetId");
    return NextResponse.json(
      assetId ? await resumeFootage(null, footageId(assetId)) : await footageState(null),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const { user, session } = await requireAdmin();
  try {
    checkFootageOrigin(request);
    const data = await readFootageJson(request);
    const actor = user?.id || session?.user?.email || "development-admin";
    switch (data.action) {
      case "begin":
        return NextResponse.json(await beginFootage(null, actor, data), { status: 201, headers });
      case "finish":
        await finishFootage(null, footageId(data.assetId));
        break;
      case "remove":
        return NextResponse.json(await removeFootage(null, footageId(data.assetId), data.confirmed), { headers });
      default:
        throw new FootageError("Unknown shared footage action.");
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  await requireAdmin();
  try {
    checkFootageOrigin(request);
    if (request.headers.get("content-type") !== "application/octet-stream") {
      throw new FootageError("Use the SIXFL TV uploader to send this file.");
    }
    const url = new URL(request.url);
    const part = url.searchParams.get("part");
    if (!part || !/^\d{1,4}$/.test(part)) throw new FootageError("Invalid upload part.");
    const assetId = footageId(url.searchParams.get("assetId"));
    const bytes = await readFootageBytes(request);
    return NextResponse.json(await putFootagePart(null, assetId, Number(part), bytes), { headers });
  } catch (error) {
    return failure(error);
  }
}
