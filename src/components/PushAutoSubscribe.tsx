"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function PushAutoSubscribe() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, subscribe } = usePushNotifications();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (user && isSupported && !isSubscribed && !attemptedRef.current) {
      attemptedRef.current = true;
      subscribe();
    }
    // Reset when user logs out so we can re-attempt on next login
    if (!user) {
      attemptedRef.current = false;
    }
  }, [user, isSupported, isSubscribed, subscribe]);

  return null;
}
