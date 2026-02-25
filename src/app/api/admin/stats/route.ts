import { NextRequest, NextResponse } from "next/server";
import { getUserCount, getBroadcastCount, getPushSubscriptionCount } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    userCount: getUserCount(),
    broadcastCount: getBroadcastCount(),
    pushSubscriptionCount: getPushSubscriptionCount(),
  });
}
