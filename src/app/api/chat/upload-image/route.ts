import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import { sendPushToAll } from "@/features/push/lib/push";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_MAX = 10 * 1024 * 1024; // 10MB

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

    const uploadsDir = path.join(process.cwd(), "uploads/chat");
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const imageUrl = `/api/uploads/chat/${filename}`;
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
