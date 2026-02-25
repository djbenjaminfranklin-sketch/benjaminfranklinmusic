import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllUsers, createBroadcast, getBroadcasts } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";
import { addChatMessage } from "@/lib/sse-hub";
import { Resend } from "resend";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const broadcasts = getBroadcasts();
  return NextResponse.json({ broadcasts });
}

const broadcastSchema = z.object({
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  channels: z.array(z.enum(["email", "push", "chat"])).min(1, "At least one channel required"),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const result = broadcastSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, message, channels } = result.data;
    const users = getAllUsers();
    let recipientCount = 0;

    // Email broadcast
    if (channels.includes("email")) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const resend = new Resend(resendKey);
        const emails = users.map((u) => u.email).filter(Boolean);
        // Send in batches of 50
        for (let i = 0; i < emails.length; i += 50) {
          const batch = emails.slice(i, i + 50);
          await Promise.allSettled(
            batch.map((email) =>
              resend.emails.send({
                from: "Benjamin Franklin <onboarding@resend.dev>",
                to: email,
                subject: title,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ededed; padding: 32px; border-radius: 12px;">
                    <h2 style="color: #c9a84c; margin-bottom: 16px;">${title}</h2>
                    <p style="line-height: 1.6; white-space: pre-wrap;">${message}</p>
                    <hr style="border: none; border-top: 1px solid #1e1e22; margin: 24px 0;" />
                    <p style="font-size: 12px; color: #666;">Benjamin Franklin Music</p>
                  </div>
                `,
              })
            )
          );
        }
        recipientCount = Math.max(recipientCount, emails.length);
      }
    }

    // Push broadcast
    if (channels.includes("push")) {
      const pushCount = await sendPushToAll(title, message);
      recipientCount = Math.max(recipientCount, pushCount);
    }

    // Chat broadcast
    if (channels.includes("chat")) {
      const { getDynamicConfig } = await import("@/lib/dynamic-config");
      const config = getDynamicConfig();
      addChatMessage(config.artist.name, `${title}: ${message}`, true);
      recipientCount = Math.max(recipientCount, 1);
    }

    const broadcast = createBroadcast(title, message, channels, admin.id, recipientCount);

    return NextResponse.json({ success: true, recipientCount, broadcast });
  } catch {
    return NextResponse.json(
      { error: "Failed to send broadcast" },
      { status: 500 }
    );
  }
}
