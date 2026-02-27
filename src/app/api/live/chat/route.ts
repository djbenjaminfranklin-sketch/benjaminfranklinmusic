import { NextRequest, NextResponse } from "next/server";
import { addLiveChatMessage } from "@/shared/lib/sse-hub";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { author, content, djPassword } = body;

    if (!author || !content) {
      return NextResponse.json(
        { error: "author and content are required" },
        { status: 400 },
      );
    }

    const config = getDynamicConfig();
    const isDJ = djPassword === config.live.adminPassword;
    const msg = addLiveChatMessage(author, content, isDJ);
    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
