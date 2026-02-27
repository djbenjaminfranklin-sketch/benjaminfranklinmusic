"use client";

import { useCallback } from "react";

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export function useLiveAdmin() {
  const goLive = useCallback(async (streamUrl: string, djPassword: string, venue?: string) => {
    const location = await getPosition();
    const res = await fetch("/api/live/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "go-live",
        streamUrl,
        djPassword,
        venue,
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to go live");
    }
  }, []);

  const stopLive = useCallback(async (djPassword: string) => {
    const res = await fetch("/api/live/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop-live", djPassword }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to stop live");
    }
  }, []);

  const updateTrack = useCallback(
    async (artist: string, title: string, djPassword: string) => {
      const res = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-track", artist, title, djPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update track");
      }
    },
    [],
  );

  return { goLive, stopLive, updateTrack };
}
