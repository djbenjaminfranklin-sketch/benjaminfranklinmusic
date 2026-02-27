"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const subscribingRef = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        setRegistration(reg);
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
          setIsReady(true);
          // Re-sync keys to server in correct base64url format (one-time fix)
          if (sub && !localStorage.getItem("push-keys-v2")) {
            const subJson = sub.toJSON();
            fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
            }).then((res) => { if (res.ok) localStorage.setItem("push-keys-v2", "1"); }).catch(() => {});
          }
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!registration || !VAPID_PUBLIC_KEY || subscribingRef.current) return false;
    subscribingRef.current = true;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Use toJSON() to get keys in base64url format (required by web-push)
      const subJson = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      subscribingRef.current = false;
    }
  }, [registration]);

  const unsubscribe = useCallback(async () => {
    if (!registration) return false;

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch {
      return false;
    }
  }, [registration]);

  return { isSupported, isSubscribed, isReady, subscribe, unsubscribe };
}
