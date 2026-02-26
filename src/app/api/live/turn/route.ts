import { NextResponse } from "next/server";

// Fetches temporary TURN credentials from Metered.ca
// These credentials rotate automatically (more secure than static ones)
export async function GET() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  console.log("[TURN] Config check — appName:", appName ? `"${appName}"` : "MISSING", "apiKey:", apiKey ? "SET" : "MISSING");

  if (!appName || !apiKey) {
    return NextResponse.json([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  }

  // Try both Metered API domain formats
  const urls = [
    `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
    `https://${appName}.metered.ca/api/v1/turn/credentials?apiKey=${apiKey}`,
  ];

  for (const url of urls) {
    try {
      console.log("[TURN] Trying:", url.replace(apiKey, "***"));
      const res = await fetch(url);

      if (res.ok) {
        const credentials = await res.json();
        console.log("[TURN] Success — got", credentials.length, "servers");
        return NextResponse.json(credentials);
      }

      console.error("[TURN] API error:", res.status, await res.text());
    } catch (err) {
      console.error("[TURN] Fetch failed:", err);
    }
  }

  // Fallback to STUN only
  return NextResponse.json([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
}
