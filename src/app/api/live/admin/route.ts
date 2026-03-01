import { NextRequest, NextResponse } from "next/server";
import {
  getLiveState,
  setLiveStatus,
  updateCurrentTrack,
  updateLocation,
  ensureCoHostCode,
  emitScheduledLive,
  addChatMessage,
  setCloudflareStreamUid,
  getCloudflareStreamUid,
  setCloudflareWhepUrl,
  setBroadcaster,
} from "@/shared/lib/sse-hub";
import { getAuthUser } from "@/features/auth/lib/auth";
import { sendPushToAll } from "@/features/push/lib/push";
import { getScheduledLive, setScheduledLive, getDynamicConfig } from "@/shared/lib/dynamic-config";
import { isCloudflareConfigured, createLiveInput, deleteLiveInput } from "@/shared/lib/cloudflare-stream";

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
    const { action, djPassword, streamUrl, streamType, artist, title, venue, lat, lng, date, city, flyerUrl, broadcasterId: clientBroadcasterId } = body;

    // Auth: accepte soit le cookie admin soit le mot de passe legacy
    const user = await getAuthUser(request);
    const isAdmin = user?.role === "admin";
    const config = getDynamicConfig();
    const isPasswordValid = djPassword === config.live.adminPassword;

    if (!isAdmin && !isPasswordValid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    switch (action) {
      case "create-stream": {
        if (!isCloudflareConfigured()) {
          return NextResponse.json(
            { error: "Cloudflare Stream not configured" },
            { status: 400 },
          );
        }
        const input = await createLiveInput();
        setCloudflareStreamUid(input.uid);
        setCloudflareWhepUrl(input.whepUrl);
        return NextResponse.json({
          whipUrl: input.whipUrl,
          whepUrl: input.whepUrl,
          hlsUrl: input.hlsUrl,
        });
      }

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
          // Register the broadcaster's SSE client so disconnect is detected
          if (clientBroadcasterId) {
            setBroadcaster(clientBroadcasterId);
          }
          // Auto-clear scheduled live when going live
          setScheduledLive(null);
          emitScheduledLive(null);
        }

        // Notification push a tous les abonnes
        {
          const pushTitle = `${config.artist.name} is LIVE!`;
          const pushMessage = venue
            ? `Join the live now from ${venue}`
            : "Join the live now!";
          sendPushToAll(pushTitle, pushMessage).catch(() => {});
        }
        break;

      case "stop-live": {
        // Delete Cloudflare Live Input if one was created
        const cfUid = getCloudflareStreamUid();
        if (cfUid) {
          deleteLiveInput(cfUid).catch(() => {});
        }
        setLiveStatus(false);
        break;
      }

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
        setScheduledLive({ date, venue, city, flyerUrl: flyerUrl || undefined });
        emitScheduledLive({ date, venue, city, flyerUrl: flyerUrl || undefined });
        {
          const d = new Date(date);
          const formatted = d.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })
            + " — " + d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
          const chatContent = `📅 ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}\n📍 ${venue}, ${city}`;
          addChatMessage(
            config.artist.name,
            chatContent,
            true,
            undefined,
            undefined,
            flyerUrl || undefined,
            flyerUrl ? `Live — ${venue}, ${city}` : undefined,
          );
          // Build absolute image URL for push
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
          const pushImage = flyerUrl && baseUrl ? `${baseUrl}${flyerUrl}` : undefined;
          sendPushToAll(
            `${config.artist.name} programme un live !`,
            `${venue}, ${city}`,
            pushImage
          ).catch(() => {});
        }
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
