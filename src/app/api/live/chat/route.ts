import { NextRequest, NextResponse } from "next/server";
import { addLiveChatMessage } from "@/shared/lib/sse-hub";
import siteConfig from "../../../../../site.config";

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

    const isDJ = djPassword === siteConfig.live.adminPassword;
    const msg = addLiveChatMessage(author, content, isDJ);
    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
