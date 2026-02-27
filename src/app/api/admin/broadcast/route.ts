import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllUsers, createBroadcast, getBroadcasts } from "@/shared/lib/db";
import { requireAdmin } from "@/features/auth/lib/auth";
import { sendPushToAll } from "@/features/push/lib/push";
import { addChatMessage } from "@/shared/lib/sse-hub";
import { Resend } from "resend";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  imageUrl: z.string().optional(),
});

interface ChannelResult {
  success: boolean;
  sent: number;
  failed: number;
  error?: string;
}

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

    const { title, message, channels, imageUrl } = result.data;
    const users = getAllUsers();
    let recipientCount = 0;
    const channelResults: Record<string, ChannelResult> = {};

    // Email broadcast
    if (channels.includes("email")) {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.warn("[broadcast] RESEND_API_KEY not configured, skipping email channel");
        channelResults.email = { success: false, sent: 0, failed: 0, error: "RESEND_API_KEY not configured" };
      } else {
        const resend = new Resend(resendKey);
        const emails = users.map((u) => u.email).filter(Boolean);
        let emailSent = 0;
        let emailFailed = 0;
        // Send in batches of 50
        for (let i = 0; i < emails.length; i += 50) {
          const batch = emails.slice(i, i + 50);
          const results = await Promise.allSettled(
            batch.map((email) =>
              resend.emails.send({
                from: "Benjamin Franklin <onboarding@resend.dev>",
                to: email,
                subject: title,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ededed; padding: 32px; border-radius: 12px;">
                    <h2 style="color: #c9a84c; margin-bottom: 16px;">${escapeHtml(title)}</h2>
                    <p style="line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
                    ${imageUrl ? `<img src="${request.nextUrl.origin}${imageUrl}" alt="" style="max-width: 100%; border-radius: 8px; margin-top: 16px;" />` : ""}
                    <hr style="border: none; border-top: 1px solid #1e1e22; margin: 24px 0;" />
                    <p style="font-size: 12px; color: #666;">Benjamin Franklin Music</p>
                  </div>
                `,
              })
            )
          );
          for (const r of results) {
            if (r.status === "fulfilled") {
              emailSent++;
            } else {
              emailFailed++;
              console.error("[broadcast] Email send failed:", r.reason);
            }
          }
        }
        console.log(`[broadcast] Email: ${emailSent} sent, ${emailFailed} failed out of ${emails.length}`);
        channelResults.email = { success: emailFailed === 0, sent: emailSent, failed: emailFailed };
        recipientCount = Math.max(recipientCount, emailSent);
      }
    }

    // Push broadcast
    if (channels.includes("push")) {
      try {
        const pushCount = await sendPushToAll(title, message, imageUrl);
        console.log(`[broadcast] Push: ${pushCount} notifications sent`);
        channelResults.push = { success: true, sent: pushCount, failed: 0 };
        recipientCount = Math.max(recipientCount, pushCount);
      } catch (err) {
        console.error("[broadcast] Push channel failed:", err);
        channelResults.push = { success: false, sent: 0, failed: 0, error: "Push notification delivery failed" };
      }
    }

    // Chat broadcast
    if (channels.includes("chat")) {
      try {
        const { getDynamicConfig } = await import("@/shared/lib/dynamic-config");
        const config = getDynamicConfig();
        addChatMessage(config.artist.name, `${title}: ${message}`, true, undefined, undefined, imageUrl);
        console.log("[broadcast] Chat message posted");
        channelResults.chat = { success: true, sent: 1, failed: 0 };
        recipientCount = Math.max(recipientCount, 1);
      } catch (err) {
        console.error("[broadcast] Chat channel failed:", err);
        channelResults.chat = { success: false, sent: 0, failed: 0, error: "Failed to post chat message" };
      }
    }

    const broadcast = createBroadcast(title, message, channels, admin.id, recipientCount);

    return NextResponse.json({ success: true, recipientCount, broadcast, channelResults });
  } catch (err) {
    console.error("[broadcast] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to send broadcast" },
      { status: 500 }
    );
  }
}
