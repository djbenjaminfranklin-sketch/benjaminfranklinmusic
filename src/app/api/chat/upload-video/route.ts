import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/lib/sse-hub";
import { getDynamicConfig } from "@/lib/dynamic-config";
import { sendPushToAll } from "@/lib/push";

const VIDEO_MAX = 100 * 1024 * 1024; // 100MB

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

    const uploadsDir = path.join(process.cwd(), "uploads/video");
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop() || "mp4";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const videoUrl = `/api/uploads/video/${filename}`;
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
