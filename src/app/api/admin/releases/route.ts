import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getReleases, createRelease } from "@/lib/dynamic-config";

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
    return NextResponse.json(release, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create release" }, { status: 500 });
  }
}
