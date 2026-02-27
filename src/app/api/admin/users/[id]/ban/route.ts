import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";
import { banUser, unbanUser, getUserById } from "@/shared/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const user = getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent banning another admin
  if (user.role === "admin") {
    return NextResponse.json({ error: "Cannot ban an admin" }, { status: 403 });
  }

  banUser(id);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const user = getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  unbanUser(id);
  return NextResponse.json({ success: true });
}
