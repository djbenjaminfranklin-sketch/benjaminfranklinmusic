import { NextRequest, NextResponse } from "next/server";
import { getAPNsDiagnostics } from "@/features/push/lib/apns";
import { getPushSubscriptionCount } from "@/shared/lib/db";
import { requireAdmin } from "@/features/auth/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apns = getAPNsDiagnostics();
  const webPushSubscriptions = getPushSubscriptionCount();

  return NextResponse.json({
    apns,
    webPush: {
      subscriptions: webPushSubscriptions,
      vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    },
  });
}
