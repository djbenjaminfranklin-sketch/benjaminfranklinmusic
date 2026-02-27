import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/lib/auth";
import { getAllSettings, setSetting } from "@/shared/lib/dynamic-config";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const settings = getAllSettings();
  return NextResponse.json(groupSettings(settings));
}

/**
 * Convert flat DB keys ("artist.name") into nested structure
 * that the frontend Settings interface expects.
 */
function groupSettings(flat: Record<string, string>): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(flat)) {
    const dot = key.indexOf(".");
    if (dot === -1) continue;
    const section = key.slice(0, dot);
    const field = key.slice(dot + 1);
    if (!result[section]) result[section] = {};
    result[section][field] = value;
  }
  return result;
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Body must be an object of key-value pairs" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        setSetting(key, value);
      }
    }

    // Purge Next.js cache so pages re-render with new values
    revalidatePath("/", "layout");

    const settings = getAllSettings();
    return NextResponse.json(groupSettings(settings));
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
