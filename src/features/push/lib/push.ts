import webpush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "@/shared/lib/db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:booking@benjaminfranklinmusic.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[push] VAPID keys not configured — push notifications will not work");
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string,
  body: string,
  image?: string
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] Cannot send notification: VAPID keys not configured");
    return false;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({ title, body, icon: "/logo.png", badge: "/logo.png", image })
    );
    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      console.log(`[push] Removing expired subscription (status ${statusCode}): ${subscription.endpoint}`);
      deletePushSubscription(subscription.endpoint);
    } else {
      console.error(`[push] Failed to send to ${subscription.endpoint}:`, error);
    }
    return false;
  }
}

export async function sendPushToAll(title: string, body: string, image?: string): Promise<number> {
  // Web Push (browsers)
  const subscriptions = getPushSubscriptions();
  let webCount = 0;

  if (subscriptions.length > 0) {
    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const success = await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          title,
          body,
          image
        );
        if (success) webCount++;
      })
    );
    console.log(`[push] Web push: ${webCount}/${subscriptions.length} delivered`);
  }

  // APNs (iOS native app)
  let apnsCount = 0;
  try {
    const { sendAPNsToAll } = await import("./apns");
    apnsCount = await sendAPNsToAll(title, body, image);
  } catch (err) {
    console.error("[push] APNs send error:", err);
  }

  const total = webCount + apnsCount;
  console.log(`[push] sendPushToAll total: ${total} (web: ${webCount}, apns: ${apnsCount})`);
  return total;
}
