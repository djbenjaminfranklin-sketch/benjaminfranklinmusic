"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TrackResult {
  artist: string;
  title: string;
  album?: string;
  spotify_url?: string | null;
}

export default function SpynButton() {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const identify = useCallback(async () => {
    if (isListening) return;
    setError(null);
    setResult(null);
    setIsListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const formData = new FormData();
        formData.append("audio", blob, "recording.wav");

        try {
          const res = await fetch("/api/live/identify", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (res.ok) {
            setResult(data);
            // Auto-hide after 8 seconds
            setTimeout(() => setResult(null), 8000);
          } else {
            setError(data.error || "Aucun morceau détecté");
            setTimeout(() => setError(null), 4000);
          }
        } catch {
          setError("Erreur de détection");
          setTimeout(() => setError(null), 4000);
        } finally {
          setIsListening(false);
        }
      };

      mediaRecorder.start();

      // Record for 8 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 8000);
    } catch {
      setError("Accès micro refusé");
      setTimeout(() => setError(null), 4000);
      setIsListening(false);
    }
  }, [isListening]);

  return (
    <>
      {/* Spyn button — bottom right, above chat */}
      <button
        onClick={identify}
        disabled={isListening}
        className="absolute bottom-20 right-3 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-accent/90 backdrop-blur-sm border-2 border-accent shadow-lg active:scale-90 transition-transform disabled:animate-pulse touch-manipulation"
      >
        {/* Sound wave icon */}
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-background" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 6v12" />
          <path d="M8 9v6" />
          <path d="M16 9v6" />
          <path d="M4 11v2" />
          <path d="M20 11v2" />
        </svg>
      </button>

      {/* Result popup */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-36 right-3 z-30 max-w-[220px] rounded-xl bg-black/80 backdrop-blur-md px-4 py-3 border border-accent/30 shadow-xl"
          >
            <p className="text-xs font-bold text-accent mb-0.5">SPYN</p>
            <p className="text-sm font-bold text-white truncate">{result.title}</p>
            <p className="text-xs text-white/60 truncate">{result.artist}</p>
            {result.spotify_url && (
              <a
                href={result.spotify_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-green-400 font-medium"
              >
                ▶ Spotify
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error popup */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-36 right-3 z-30 rounded-xl bg-red-500/20 backdrop-blur-sm px-3 py-2 border border-red-500/30"
          >
            <p className="text-xs text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listening indicator */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-36 right-3 z-30 rounded-xl bg-accent/20 backdrop-blur-sm px-3 py-2 border border-accent/30"
          >
            <p className="text-xs text-accent font-medium animate-pulse">Écoute en cours...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
