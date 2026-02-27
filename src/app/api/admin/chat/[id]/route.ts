import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";
import { deleteChatMessage } from "@/shared/lib/sse-hub";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = deleteChatMessage(id);
  if (!deleted) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
