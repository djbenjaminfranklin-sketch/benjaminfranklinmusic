import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Apple Sign-In not configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://benjaminfranklinmusic.onrender.com";
  const state = crypto.randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/apple/callback`,
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state,
  });

  const response = NextResponse.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
  // Apple callback is a cross-origin POST → sameSite must be "none" + secure
  response.cookies.set("oauth-state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 600,
    path: "/",
  });

  return response;
}
