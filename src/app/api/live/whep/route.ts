import { NextRequest, NextResponse } from "next/server";
import { getLiveState } from "@/shared/lib/sse-hub";

/**
 * WHEP proxy — forwards the viewer's SDP offer to the actual Cloudflare
 * WHEP endpoint, avoiding any browser CORS issues.
 */
export async function POST(request: NextRequest) {
  const state = getLiveState();

  if (!state.status.isLive || !state.status.streamUrl) {
    return NextResponse.json({ error: "No active stream" }, { status: 404 });
  }

  const whepUrl = state.status.streamUrl;
  const sdpOffer = await request.text();

  console.log("[WHEP Proxy] Forwarding to:", whepUrl);

  try {
    const res = await fetch(whepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOffer,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[WHEP Proxy] Cloudflare error:", res.status, body);
      return new NextResponse(body, {
        status: res.status,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const sdpAnswer = await res.text();
    console.log("[WHEP Proxy] Success — SDP answer received");

    return new NextResponse(sdpAnswer, {
      headers: { "Content-Type": "application/sdp" },
    });
  } catch (err) {
    console.error("[WHEP Proxy] Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach WHEP endpoint" },
      { status: 502 },
    );
  }
}
