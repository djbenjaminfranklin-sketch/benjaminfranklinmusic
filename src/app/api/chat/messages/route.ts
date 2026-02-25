import { NextRequest, NextResponse } from "next/server";
import { addChatMessage, addChatReaction } from "@/lib/sse-hub";
import { getDynamicConfig } from "@/lib/dynamic-config";

const VALID_REACTIONS = ["fire", "heart", "100", "headphones", "vinyl"];

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
    const isDJ = djPassword === config.fanZone.djPassword;
    const msg = addChatMessage(author, content, isDJ);
    return NextResponse.json(msg, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId, reaction } = body;

    if (!postId || !reaction) {
      return NextResponse.json(
        { error: "postId and reaction are required" },
        { status: 400 },
      );
    }

    if (!VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json(
        { error: "Invalid reaction" },
        { status: 400 },
      );
    }

    const msg = addChatReaction(postId, reaction);
    if (!msg) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(msg);
  } catch {
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 },
    );
  }
}
