"use client";

import { useState, useCallback, useRef } from "react";

interface TrackResult {
  artist: string;
  title: string;
  album?: string;
  spotify_url?: string | null;
}

export function useACRCloud() {
  const [isListening, setIsListening] = useState(false);
  const [track, setTrack] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const identifyTrack = useCallback(async () => {
    setError(null);
    setTrack(null);
    setIsListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        try {
          const res = await fetch("/api/admin/acrcloud", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (res.ok) {
            setTrack(data);
          } else {
            setError(data.error || "No track identified");
          }
        } catch {
          setError("Failed to identify track");
        } finally {
          setIsListening(false);
        }
      };

      mediaRecorder.start();

      // Record for 10 seconds then stop
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 10000);
    } catch {
      setError("Microphone access denied");
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { isListening, track, error, identifyTrack, stopListening };
}
