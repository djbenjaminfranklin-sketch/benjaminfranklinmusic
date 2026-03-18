import { NextRequest, NextResponse } from "next/server";
import {
  getUserByProvider,
  getUserByEmail,
  createOAuthUser,
  linkProviderToUser,
  createSession,
  promoteToAdmin,
} from "@/shared/lib/db";
import { createJWT, setAuthCookie } from "@/features/auth/lib/auth";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://benjaminfranklinmusic.onrender.com";

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = request.cookies.get("oauth-state")?.value;

    if (!code || !state || state !== storedState) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=invalid_state`);
    }

    // Detect native iOS app from the _ios suffix in the state
    const isNativeIOS = state.endsWith("_ios");

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=userinfo_failed`);
    }

    const profile = await userInfoRes.json();
    const email = (profile.email as string).toLowerCase();
    const name = profile.name || email.split("@")[0];
    const providerId = profile.id as string;
    const avatarUrl = profile.picture as string | undefined;

    // 1. Check by provider_id
    let user = getUserByProvider("google", providerId);

    // 2. Check by email (auto-link)
    if (!user) {
      const existingUser = getUserByEmail(email);
      if (existingUser) {
        linkProviderToUser(existingUser.id, "google", providerId, avatarUrl);
        user = existingUser;
      }
    }

    // 3. Create new user
    if (!user) {
      user = createOAuthUser(email, name, "google", providerId, avatarUrl);
    }

    if (user.banned === 1) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=account_suspended`);
    }

    // Auto-promote admin emails
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes(email) && user.role !== "admin") {
      promoteToAdmin(user.id);
    }

    const session = createSession(user.id);
    const token = createJWT({ userId: user.id, sessionId: session.id });

    // Native iOS app: redirect via custom URL scheme so ASWebAuthenticationSession closes
    if (isNativeIOS) {
      const redirectUrl = `bfmusic://auth-callback?token=${encodeURIComponent(token)}`;
      return new NextResponse(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirectUrl}"></head><body><script>window.location.href="${redirectUrl}";</script></body></html>`,
        {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const response = NextResponse.redirect(`${baseUrl}/`);
    response.cookies.delete("oauth-state");
    return setAuthCookie(response, token);
  } catch {
    return NextResponse.redirect(`${baseUrl}/?auth_error=google_failed`);
  }
}
