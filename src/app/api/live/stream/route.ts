import { NextRequest } from "next/server";
import {
  connectLive,
  disconnectLive,
  getLiveState,
  onLive,
  type SignalMessage,
} from "@/lib/sse-hub";
import { getScheduledLive } from "@/lib/dynamic-config";
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

      // Send initial state + this client's ID
      const state = getLiveState();
      const scheduledLive = getScheduledLive();
      send("init", { ...state, clientId, scheduledLive });

      // Subscribe to events
      const unsubs = [
        onLive("message", (msg) => send("message", msg)),
        onLive("presence", (data) => send("presence", data)),
        onLive("status", (data) => send("status", data)),
        onLive("track", (data) => send("track", data)),
        onLive("signal", (signal) => {
          const sig = signal as SignalMessage;
          // Only forward signals addressed to this client (or broadcast signals)
          if (!sig.to || sig.to === clientId) {
            send("signal", sig);
          }
        }),
        onLive("invite", (data) => {
          // Only send invite to the targeted viewer
          const inv = data as { inviteId: string; viewerId: string };
          if (inv.viewerId === clientId) {
            send("invite", inv);
          }
        }),
        onLive("invite-response", (data) => {
          // Send invite responses to the broadcaster
          send("invite-response", data);
        }),
        onLive("co-hosts", (data) => {
          send("co-hosts", data);
        }),
        onLive("scheduled", (data) => {
          send("scheduled", data);
        }),
        onLive("heartbeat", () => {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }),
      ];

      connectLive(clientId);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        unsubs.forEach((fn) => fn());
        disconnectLive(clientId);
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
