import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, sanitizeUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({ user: sanitizeUser(user) });
  } catch {
    return NextResponse.json({ user: null });
  }
}
