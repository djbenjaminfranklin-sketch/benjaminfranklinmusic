import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import { sendPushToAll } from "@/features/push/lib/push";

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

    const uploadsDir = path.join(process.cwd(), "uploads/audio");
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop() || "mp3";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const audioUrl = `/api/uploads/audio/${filename}`;
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
