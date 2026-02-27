"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { usePushNotifications } from "@/features/push/hooks/usePushNotifications";

export default function PushAutoSubscribe() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, isReady, subscribe } = usePushNotifications();
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Wait until isReady so we know whether user is already subscribed
    if (user && isSupported && isReady && !isSubscribed && !attemptedRef.current) {
      attemptedRef.current = true;
      subscribe();
    }
    // Reset when user logs out so we can re-attempt on next login
    if (!user) {
      attemptedRef.current = false;
    }
  }, [user, isSupported, isReady, isSubscribed, subscribe]);

  return null;
}
