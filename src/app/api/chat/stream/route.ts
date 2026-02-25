import { NextRequest } from "next/server";
import {
  connectChat,
  disconnectChat,
  getChatState,
  onChat,
} from "@/lib/sse-hub";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Send initial state
      const state = getChatState();
      send("init", state);

      // Subscribe to events
      const unsubs = [
        onChat("message", (msg) => send("message", msg)),
        onChat("reaction", (data) => send("reaction", data)),
        onChat("presence", (data) => send("presence", data)),
        onChat("delete", (data) => send("delete", data)),
        onChat("heartbeat", () => {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }),
      ];

      connectChat(clientId);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        unsubs.forEach((fn) => fn());
        disconnectChat(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
