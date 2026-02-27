import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";
import { seedFromStaticConfig } from "@/shared/lib/dynamic-config";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = seedFromStaticConfig();
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: "Failed to seed data" }, { status: 500 });
  }
}
