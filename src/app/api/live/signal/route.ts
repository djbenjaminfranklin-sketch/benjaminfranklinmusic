import { NextRequest, NextResponse } from "next/server";
import { relaySignal, setBroadcaster, setLiveStatus, getBroadcaster, getRandomViewer, sendInvite, sendInviteResponse, addCoHost, removeCoHost, getCoHosts, validateCoHostCode, getLiveState } from "@/shared/lib/sse-hub";
import { getAuthUser } from "@/features/auth/lib/auth";
import { sendPushToAll } from "@/features/push/lib/push";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, from, to, data, venue, lat, lng, name } = body;

    if (!type || !from) {
      return NextResponse.json({ error: "type and from are required" }, { status: 400 });
    }

    // "start-broadcast" et "stop-broadcast" nécessitent l'auth admin
    if (type === "start-broadcast") {
      const user = await getAuthUser(request);
      if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      setBroadcaster(from);
      const location = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined;
      setLiveStatus(true, undefined, "webrtc", location, venue);

      // Notification push a tous les abonnes
      const title = "Benjamin Franklin is LIVE!";
      const message = venue
        ? `Join the live now from ${venue}`
        : "Join the live now!";
      sendPushToAll(title, message).catch(() => {});

      return NextResponse.json({ success: true });
    }

    if (type === "stop-broadcast") {
      const user = await getAuthUser(request);
      if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      setLiveStatus(false);
      return NextResponse.json({ success: true });
    }

    // Invite a random viewer (admin only)
    if (type === "invite-viewer") {
      const user = await getAuthUser(request);
      if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const viewerId = getRandomViewer(from);
      if (!viewerId) {
        return NextResponse.json({ error: "No viewers available" }, { status: 404 });
      }
      const inviteId = crypto.randomUUID();
      sendInvite(viewerId, inviteId, from);
      return NextResponse.json({ success: true, inviteId, viewerId });
    }

    // Viewer responds to invite
    if (type === "invite-response") {
      const { inviteId, accepted } = body;
      sendInviteResponse(inviteId, from, accepted);
      return NextResponse.json({ success: true });
    }

    // Co-host joins the live (admin only, or anyone with a valid co-host code)
    if (type === "co-host-join") {
      const user = await getAuthUser(request);
      const isAdmin = user?.role === "admin";
      const { coHostCode } = body;
      if (!isAdmin && !validateCoHostCode(coHostCode || "")) {
        return NextResponse.json({ error: "Invalid co-host code" }, { status: 403 });
      }
      const liveState = getLiveState();
      if (!liveState.status.isLive) {
        return NextResponse.json({ error: "No active broadcast" }, { status: 404 });
      }
      const added = addCoHost(from);
      if (!added) {
        return NextResponse.json({ error: "Max co-hosts reached (3)" }, { status: 400 });
      }
      // In WebRTC P2P mode, notify the broadcaster so they create a P2P connection
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        relaySignal({ type: "co-host-join", from, to: broadcaster, data });
      }
      // In HLS/WHIP mode, co-host connects directly with viewers (no broadcaster relay needed)
      return NextResponse.json({ success: true, coHostIds: getCoHosts() });
    }

    if (type === "co-host-leave") {
      removeCoHost(from);
      return NextResponse.json({ success: true });
    }

    // Viewer leaves — relay to broadcaster + co-hosts so they can cleanup the peer
    if (type === "viewer-leave") {
      const broadcaster = getBroadcaster();
      const coHosts = getCoHosts();
      if (broadcaster) {
        relaySignal({ type: "viewer-leave", from, to: broadcaster, data });
      }
      coHosts.forEach((coHostId) => {
        relaySignal({ type: "viewer-leave", from, to: coHostId, data });
      });
      return NextResponse.json({ success: true });
    }

    // Pour les signaux WebRTC (offer, answer, ice-candidate, viewer-join)
    if (type === "viewer-join") {
      const broadcaster = getBroadcaster();
      const coHosts = getCoHosts();
      console.log("[Signal] viewer-join from", from, "→ broadcaster:", broadcaster, "coHosts:", coHosts);
      // In WebRTC P2P mode, relay to broadcaster
      if (broadcaster) {
        relaySignal({ type: "viewer-join", from, to: broadcaster, data });
      }
      // Always relay to co-hosts so they can send their streams directly to viewers
      coHosts.forEach((coHostId) => {
        relaySignal({ type: "viewer-join", from, to: coHostId, data });
      });
      // Allow if there's a broadcaster OR co-hosts OR the stream is live (HLS mode)
      const liveState = getLiveState();
      if (!broadcaster && coHosts.length === 0 && !liveState.status.isLive) {
        return NextResponse.json({ error: "No active broadcast" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    relaySignal({ type, from, to, data, name });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to process signal" }, { status: 500 });
  }
}
