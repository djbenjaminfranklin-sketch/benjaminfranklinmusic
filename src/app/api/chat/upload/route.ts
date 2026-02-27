import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import { sendPushToAll } from "@/features/push/lib/push";

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  );
}

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const author = formData.get("author") as string | null;
    const title = formData.get("title") as string | null;
    const djPassword = formData.get("djPassword") as string | null;

    if (!file || !author || !title) {
      return NextResponse.json(
        { error: "file, author, and title are required" },
        { status: 400 },
      );
    }

    const config = getDynamicConfig();
    if (djPassword !== config.fanZone.djPassword) {
      return NextResponse.json(
        { error: "Invalid DJ password" },
        { status: 403 },
      );
    }

    if (!file.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Only audio files are allowed" },
        { status: 400 },
      );
    }

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50MB)" },
        { status: 400 },
      );
    }

    const ext = file.name.split(".").pop() || "mp3";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let audioUrl: string;

    if (isR2Configured()) {
      audioUrl = await uploadToR2(buffer, `audio/${filename}`, file.type);
    } else {
      const uploadsDir = path.join(process.cwd(), "uploads/audio");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, filename), buffer);
      audioUrl = `/api/uploads/audio/${filename}`;
    }

    const msg = addChatMessage(author, `🎵 ${title}`, true, audioUrl, title);

    sendPushToAll(config.artist.name, `${config.artist.name} shared a track`).catch(() => {});

    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to upload audio" },
      { status: 500 },
    );
  }
}
