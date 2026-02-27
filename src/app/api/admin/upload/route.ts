import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireAdmin } from "@/features/auth/lib/auth";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/flac", "audio/webm"];
const IMAGE_MAX = 10 * 1024 * 1024; // 10MB
const AUDIO_MAX = 50 * 1024 * 1024; // 50MB
const VALID_CATEGORIES = ["images", "covers", "audio", "chat", "flyers"];

// R2 categories — these get uploaded to Cloudflare R2 instead of local filesystem
const R2_CATEGORIES = ["audio", "covers", "flyers", "images", "chat"];

async function uploadToR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const bucket = process.env.R2_BUCKET_NAME || "benjamin-franklin-audio";
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${publicUrl}/${key}`;
}

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  );
}

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

    const ext = file.name.split(".").pop() || (isImage ? "jpg" : "mp3");
    const filename = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to R2 for audio/covers/flyers if configured
    if (R2_CATEGORIES.includes(category) && isR2Configured()) {
      const key = `${category}/${filename}`;
      const url = await uploadToR2(buffer, key, file.type);
      return NextResponse.json({ url }, { status: 201 });
    }

    // Fallback: local filesystem
    const uploadsDir = path.join(process.cwd(), `uploads/${category}`);
    await mkdir(uploadsDir, { recursive: true });

    const filepath = path.join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    const url = `/api/uploads/${category}/${filename}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
