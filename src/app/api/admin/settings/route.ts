import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAllSettings, setSetting } from "@/lib/dynamic-config";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const settings = getAllSettings();
  return NextResponse.json({ settings });
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

    const settings = getAllSettings();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
