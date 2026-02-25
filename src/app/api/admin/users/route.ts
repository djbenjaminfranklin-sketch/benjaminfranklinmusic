import { NextRequest, NextResponse } from "next/server";
import { getAllUsers } from "@/lib/db";
import { requireAdmin, sanitizeUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = getAllUsers().map(sanitizeUser);
  return NextResponse.json({ users, total: users.length });
}
