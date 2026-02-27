import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import { sendPushToAll } from "@/features/push/lib/push";

const VIDEO_MAX = 100 * 1024 * 1024; // 100MB

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

    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "Only video files are allowed" },
        { status: 400 },
      );
    }

    if (file.size > VIDEO_MAX) {
      return NextResponse.json(
        { error: "File too large (max 100MB)" },
        { status: 400 },
      );
    }

    const ext = file.name.split(".").pop() || "mp4";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let videoUrl: string;

    if (isR2Configured()) {
      videoUrl = await uploadToR2(buffer, `video/${filename}`, file.type);
    } else {
      const uploadsDir = path.join(process.cwd(), "uploads/video");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, filename), buffer);
      videoUrl = `/api/uploads/video/${filename}`;
    }

    const msg = addChatMessage(
      author,
      `🎬 ${title}`,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      videoUrl,
      title,
    );

    sendPushToAll(config.artist.name, `${config.artist.name} shared a video`).catch(() => {});

    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to upload video" },
      { status: 500 },
    );
  }
}
