import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/features/auth/lib/auth";
import { getBroadcasts } from "@/shared/lib/db";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const broadcasts = getBroadcasts();

  // Only return broadcasts that used "push" channel (relevant to the user)
  const notifications = broadcasts
    .filter((b) => {
      const channels: string[] = JSON.parse(b.channels);
      return channels.includes("push");
    })
    .map((b) => ({
      id: b.id,
      title: b.title,
      message: b.message,
      sentAt: b.sent_at,
    }));

  return NextResponse.json({ notifications });
}
