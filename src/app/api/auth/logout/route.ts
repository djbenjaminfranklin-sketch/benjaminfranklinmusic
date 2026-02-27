import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/shared/lib/db";
import { verifyJWT, clearAuthCookie } from "@/features/auth/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (token) {
      const payload = verifyJWT(token);
      if (payload) {
        deleteSession(payload.sessionId);
      }
    }

    const response = NextResponse.json({ success: true });
    return clearAuthCookie(response);
  } catch {
    const response = NextResponse.json({ success: true });
    return clearAuthCookie(response);
  }
}
