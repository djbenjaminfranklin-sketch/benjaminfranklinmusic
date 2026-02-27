import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveDeviceToken } from "@/shared/lib/db";

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  bundleId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid device token data" },
        { status: 400 }
      );
    }

    const { token, platform, bundleId } = result.data;
    saveDeviceToken(token, platform, bundleId);

    console.log(`[push] Device token registered: ${platform} ${token.slice(0, 8)}...`);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to register device" },
      { status: 500 }
    );
  }
}
