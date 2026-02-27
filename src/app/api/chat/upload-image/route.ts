import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import { sendPushToAll } from "@/features/push/lib/push";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_MAX = 10 * 1024 * 1024; // 10MB

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
    const caption = formData.get("caption") as string | null;
    const djPassword = formData.get("djPassword") as string | null;

    if (!file || !author) {
      return NextResponse.json({ error: "file and author are required" }, { status: 400 });
    }

    if (!IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only images (jpg/png/webp/gif) are allowed" }, { status: 400 });
    }

    if (file.size > IMAGE_MAX) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
    }

    const config = getDynamicConfig();
    const isDJ = djPassword === config.fanZone.djPassword;

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let imageUrl: string;

    if (isR2Configured()) {
      imageUrl = await uploadToR2(buffer, `chat/${filename}`, file.type);
    } else {
      const uploadsDir = path.join(process.cwd(), "uploads/chat");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, filename), buffer);
      imageUrl = `/api/uploads/chat/${filename}`;
    }

    const msg = addChatMessage(
      author,
      caption || "",
      isDJ,
      undefined,
      undefined,
      imageUrl,
      caption || undefined,
    );

    if (isDJ) {
      sendPushToAll(config.artist.name, `${config.artist.name} shared a photo`).catch(() => {});
    }

    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
