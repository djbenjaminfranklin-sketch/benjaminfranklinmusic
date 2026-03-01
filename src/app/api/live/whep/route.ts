import { NextRequest, NextResponse } from "next/server";
import { getLiveState, getCloudflareStreamUid, getCloudflareWhepUrl, setCloudflareWhepUrl } from "@/shared/lib/sse-hub";
import { getLiveInputStatus } from "@/shared/lib/cloudflare-stream";

/**
 * GET — diagnostic endpoint to check stream state + Cloudflare status.
 */
export async function GET() {
  const state = getLiveState();
  const cfUid = getCloudflareStreamUid();
  let cloudflare = null;

  if (cfUid) {
    cloudflare = await getLiveInputStatus(cfUid);
  }

  return NextResponse.json({
    isLive: state.status.isLive,
    streamUrl: state.status.streamUrl,
    streamType: state.status.streamType,
    whepUrl: getCloudflareWhepUrl(),
    cloudflareUid: cfUid,
    cloudflare,
  });
}

/**
 * WHEP proxy — forwards the viewer's SDP offer to the actual Cloudflare
 * WHEP endpoint, avoiding any browser CORS issues.
 */
export async function POST(request: NextRequest) {
  const state = getLiveState();
  let whepUrl = getCloudflareWhepUrl();

  // Fallback: discover WHEP URL from Cloudflare API if not stored
  if (!whepUrl) {
    const cfUid = getCloudflareStreamUid();
    if (cfUid) {
      try {
        const status = await getLiveInputStatus(cfUid);
        if (status?.webRTCPlayback?.url) {
          whepUrl = status.webRTCPlayback.url;
          setCloudflareWhepUrl(whepUrl);
          console.log("[WHEP Proxy] Discovered WHEP URL from Cloudflare API:", whepUrl);
        }
      } catch {}
    }
  }

  if (!state.status.isLive || !whepUrl) {
    console.error("[WHEP Proxy] No active stream. isLive:", state.status.isLive, "whepUrl:", whepUrl);
    return NextResponse.json({ error: "No active stream" }, { status: 404 });
  }

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
