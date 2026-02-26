import { NextResponse } from "next/server";

// Fetches temporary TURN credentials from Metered.ca
// These credentials rotate automatically (more secure than static ones)
export async function GET() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (!appName || !apiKey) {
    // Fallback: return only STUN servers (no relay)
    return NextResponse.json([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  }

  try {
    const res = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour (credentials last ~24h)
    );

    if (!res.ok) {
      console.error("[TURN] Metered API error:", res.status, await res.text());
      return NextResponse.json([
        { urls: "stun:stun.l.google.com:19302" },
      ]);
    }

    const credentials = await res.json();
    return NextResponse.json(credentials);
  } catch (err) {
    console.error("[TURN] Failed to fetch credentials:", err);
    return NextResponse.json([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
  }
}
