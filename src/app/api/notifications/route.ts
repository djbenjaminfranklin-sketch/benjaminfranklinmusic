import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/features/auth/lib/auth";
import { getBroadcasts } from "@/shared/lib/db";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read dismissed notification IDs from cookie
  const dismissedCookie = request.cookies.get("dismissed_notifs")?.value || "";
  const dismissed = new Set(dismissedCookie ? dismissedCookie.split(",") : []);

  const now = Date.now();
  const broadcasts = getBroadcasts();

  const notifications = broadcasts
    .filter((b) => {
      const channels: string[] = JSON.parse(b.channels);
      if (!channels.includes("push")) return false;
      // Expire after 24h
      const sentAt = new Date(b.sent_at + "Z").getTime();
      if (now - sentAt > TWENTY_FOUR_HOURS) return false;
      // Exclude dismissed
      if (dismissed.has(b.id)) return false;
      return true;
    })
    .map((b) => ({
      id: b.id,
      title: b.title,
      message: b.message,
      sentAt: b.sent_at,
    }));

  return NextResponse.json({ notifications });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  // Read existing dismissed IDs
  const dismissedCookie = request.cookies.get("dismissed_notifs")?.value || "";
  const dismissed = dismissedCookie ? dismissedCookie.split(",") : [];

  if (id === "all") {
    // Dismiss all current notifications
    const broadcasts = getBroadcasts();
    const now = Date.now();
    const allIds = broadcasts
      .filter((b) => {
        const channels: string[] = JSON.parse(b.channels);
        if (!channels.includes("push")) return false;
        const sentAt = new Date(b.sent_at + "Z").getTime();
        return now - sentAt <= TWENTY_FOUR_HOURS;
      })
      .map((b) => b.id);
    dismissed.push(...allIds);
  } else if (id) {
    dismissed.push(id);
  }

  // Deduplicate
  const unique = [...new Set(dismissed)];

  const response = NextResponse.json({ success: true });
  response.cookies.set("dismissed_notifs", unique.join(","), {
    maxAge: 86400, // 24h — matches notification expiry
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });

  return response;
}
