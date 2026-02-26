import { NextResponse } from "next/server";

// Returns ICE servers (STUN + TURN) for WebRTC connections
// Supports static credentials via TURN_URL/TURN_USERNAME/TURN_CREDENTIAL env vars
// Or dynamic credentials via METERED_APP_NAME/METERED_API_KEY
export async function GET() {
  const stun = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Option 1: Static TURN credentials (simplest)
  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    const urls = turnUrl.split(",").map((u) => u.trim());
    return NextResponse.json([
      ...stun,
      { urls, username: turnUser, credential: turnCred },
    ]);
  }

  // Option 2: Dynamic credentials via Metered.ca API
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (appName && apiKey) {
    try {
      const res = await fetch(
        `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
      );
      if (res.ok) {
        const credentials = await res.json();
        return NextResponse.json(credentials);
      }
      console.error("[TURN] Metered API error:", res.status);
    } catch (err) {
      console.error("[TURN] Metered fetch failed:", err);
    }
  }

  // Fallback: STUN only
  return NextResponse.json(stun);
}
