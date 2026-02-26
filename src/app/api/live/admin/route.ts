import { NextRequest, NextResponse } from "next/server";
import {
  getLiveState,
  setLiveStatus,
  updateCurrentTrack,
  updateLocation,
  ensureCoHostCode,
  emitScheduledLive,
} from "@/lib/sse-hub";
import { getAuthUser } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";
import { getScheduledLive, setScheduledLive } from "@/lib/dynamic-config";
import siteConfig from "../../../../../site.config";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const state = getLiveState();
  const scheduledLive = getScheduledLive();
  // Only return co-host code to admins — generate if not yet created
  if (user?.role === "admin") {
    return NextResponse.json({ ...state, coHostCode: ensureCoHostCode(), scheduledLive });
  }
  return NextResponse.json({ ...state, scheduledLive });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, djPassword, streamUrl, streamType, artist, title, venue, lat, lng, date, city } = body;

    // Auth: accepte soit le cookie admin soit le mot de passe legacy
    const user = await getAuthUser(request);
    const isAdmin = user?.role === "admin";
    const isPasswordValid = djPassword === siteConfig.live.adminPassword;

    if (!isAdmin && !isPasswordValid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    switch (action) {
      case "go-live":
        if (!streamUrl) {
          return NextResponse.json(
            { error: "streamUrl is required" },
            { status: 400 },
          );
        }
        {
          const location = typeof lat === "number" && typeof lng === "number"
            ? { lat, lng }
            : undefined;
          setLiveStatus(true, streamUrl, streamType || "hls", location, venue);
          // Auto-clear scheduled live when going live
          setScheduledLive(null);
          emitScheduledLive(null);
        }

        // Notification push a tous les abonnes
        {
          const pushTitle = "Benjamin Franklin est en live !";
          const pushMessage = venue
            ? `Rejoins le live maintenant depuis ${venue}`
            : "Rejoins le live maintenant !";
          sendPushToAll(pushTitle, pushMessage).catch(() => {});
        }
        break;

      case "stop-live":
        setLiveStatus(false);
        break;

      case "update-track":
        if (!artist || !title) {
          return NextResponse.json(
            { error: "artist and title are required" },
            { status: 400 },
          );
        }
        updateCurrentTrack(artist, title);
        break;

      case "schedule-live":
        if (!date || !venue || !city) {
          return NextResponse.json(
            { error: "date, venue and city are required" },
            { status: 400 },
          );
        }
        setScheduledLive({ date, venue, city });
        emitScheduledLive({ date, venue, city });
        break;

      case "cancel-schedule":
        setScheduledLive(null);
        emitScheduledLive(null);
        break;

      case "update-location":
        updateLocation(
          typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined,
          venue,
        );
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 },
        );
    }

    const state = getLiveState();
    return NextResponse.json(state);
  } catch {
    return NextResponse.json(
      { error: "Failed to process admin action" },
      { status: 500 },
    );
  }
}
