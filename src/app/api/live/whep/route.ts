import { NextRequest, NextResponse } from "next/server";
import { getLiveState } from "@/shared/lib/sse-hub";

/**
 * GET — diagnostic endpoint to check WHEP proxy state.
 */
export async function GET() {
  const state = getLiveState();
  return NextResponse.json({
    isLive: state.status.isLive,
    streamUrl: state.status.streamUrl,
    streamType: state.status.streamType,
  });
}

/**
 * WHEP proxy — forwards the viewer's SDP offer to the actual Cloudflare
 * WHEP endpoint, avoiding any browser CORS issues.
 */
export async function POST(request: NextRequest) {
  const state = getLiveState();

  if (!state.status.isLive || !state.status.streamUrl) {
    console.error("[WHEP Proxy] No active stream. isLive:", state.status.isLive, "streamUrl:", state.status.streamUrl);
    return NextResponse.json({ error: "No active stream" }, { status: 404 });
  }

  const whepUrl = state.status.streamUrl;
  const sdpOffer = await request.text();

  console.log("[WHEP Proxy] Forwarding to:", whepUrl);
  console.log("[WHEP Proxy] SDP offer length:", sdpOffer.length);

  try {
    const res = await fetch(whepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOffer,
    });

    const body = await res.text();
    console.log("[WHEP Proxy] Cloudflare response:", res.status, "body length:", body.length);

    if (!res.ok) {
      console.error("[WHEP Proxy] Cloudflare error:", res.status, body.slice(0, 500));
      return new NextResponse(body, {
        status: res.status,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.log("[WHEP Proxy] Success — SDP answer received");

    return new NextResponse(body, {
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
