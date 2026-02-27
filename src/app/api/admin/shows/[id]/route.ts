import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";
import { updateShow, deleteShow, getShowById } from "@/shared/lib/dynamic-config";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const show = updateShow(id, body);
    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json(show);
  } catch {
    return NextResponse.json({ error: "Failed to update show" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = deleteShow(id);
  if (!deleted) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
