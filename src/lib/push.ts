import webpush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "./db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:booking@benjaminfranklinmusic.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string,
  body: string,
  image?: string
): Promise<boolean> {
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
      deletePushSubscription(subscription.endpoint);
    }
    return false;
  }
}

export async function sendPushToAll(title: string, body: string, image?: string): Promise<number> {
  const subscriptions = getPushSubscriptions();
  let successCount = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const success = await sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        title,
        body,
        image
      );
      if (success) successCount++;
    })
  );

  return successCount;
}
