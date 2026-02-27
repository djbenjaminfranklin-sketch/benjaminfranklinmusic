import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getReleases, createRelease, getDynamicConfig } from "@/lib/dynamic-config";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const releases = getReleases();
  return NextResponse.json({ releases });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, type, releaseDate, coverUrl, audioUrl, spotifyUrl, spotifyEmbedId, featured, sortOrder } = body;

    if (!title || !type || !releaseDate || !coverUrl) {
      return NextResponse.json({ error: "title, type, releaseDate, and coverUrl are required" }, { status: 400 });
    }

    const release = createRelease({ title, type, releaseDate, coverUrl, audioUrl, spotifyUrl, spotifyEmbedId, featured, sortOrder });

    const config = getDynamicConfig();
    sendPushToAll(
      `${config.artist.name} — New ${type}!`,
      `${title} is now available`
    ).catch(() => {});

    return NextResponse.json(release, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create release" }, { status: 500 });
  }
}
