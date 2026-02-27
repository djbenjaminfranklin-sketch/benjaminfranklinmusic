import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireAdmin } from "@/lib/auth";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/flac", "audio/webm"];
const IMAGE_MAX = 10 * 1024 * 1024; // 10MB
const AUDIO_MAX = 50 * 1024 * 1024; // 50MB
const VALID_CATEGORIES = ["images", "covers", "audio", "chat", "flyers"];

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "images";

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
    }

    const isImage = IMAGE_TYPES.includes(file.type);
    const isAudio = AUDIO_TYPES.includes(file.type);

    if (!isImage && !isAudio) {
      return NextResponse.json({ error: "Only images (jpg/png/webp/gif) and audio (mp3/wav/m4a/aac/ogg/flac/webm) files are allowed" }, { status: 400 });
    }

    if (isImage && file.size > IMAGE_MAX) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
    }

    if (isAudio && file.size > AUDIO_MAX) {
      return NextResponse.json({ error: "Audio too large (max 50MB)" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), `uploads/${category}`);
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop() || (isImage ? "jpg" : "mp3");
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const url = `/api/uploads/${category}/${filename}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
