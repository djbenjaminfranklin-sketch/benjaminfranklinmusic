"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TrackResult {
  artist: string;
  title: string;
  album?: string;
  spotify_url?: string | null;
}

interface SpynButtonProps {
  inline?: boolean;
}

export default function SpynButton({ inline = false }: SpynButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Record a chunk and send to ACRCloud, returns the track or null
  const recordAndIdentify = useCallback(async (stream: MediaStream, mimeType: string): Promise<TrackResult | null> => {
    return new Promise((resolve) => {
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        const formData = new FormData();
        formData.append("audio", blob, "recording.wav");

        try {
          const res = await fetch("/api/live/identify", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (res.ok) {
            resolve(data);
            return;
          }
        } catch {}
        resolve(null);
      };

      recorder.start();

      // Record for 10 seconds per attempt
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 10000);
    });
  }, []);

  const identify = useCallback(async () => {
    // If already listening, cancel
    if (isListening) {
      cancelledRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsListening(false);
      setAttempt(0);
      return;
    }

    setError(null);
    setResult(null);
    setIsListening(true);
    cancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";

      // Loop: record + identify, retry up to 6 times (60 seconds max)
      const maxAttempts = 6;
      for (let i = 0; i < maxAttempts; i++) {
        if (cancelledRef.current) break;
        setAttempt(i + 1);

        const track = await recordAndIdentify(stream, mimeType);

        if (cancelledRef.current) break;

        if (track) {
          setResult(track);
          setTimeout(() => setResult(null), 10000);
          break;
        }

        // Last attempt failed — show message
        if (i === maxAttempts - 1) {
          setError("Aucun morceau détecté");
          setTimeout(() => setError(null), 4000);
        }
      }

      // Cleanup
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } catch {
      setError("Accès micro refusé");
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsListening(false);
      setAttempt(0);
    }
  }, [isListening, recordAndIdentify]);

  return (
    <div className={inline ? "relative" : "contents"}>
      {/* Spyn button — solid accent with Shazam-like pulse rings when listening */}
      <div className="relative flex items-center justify-center">
        {/* Animated pulse rings when listening */}
        <AnimatePresence>
          {isListening && (
            <>
              <motion.span
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                className={`absolute rounded-full bg-accent ${inline ? "w-14 h-14" : "w-12 h-12"}`}
              />
              <motion.span
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                className={`absolute rounded-full bg-accent ${inline ? "w-14 h-14" : "w-12 h-12"}`}
              />
            </>
          )}
        </AnimatePresence>
        <button
          onClick={identify}
          className={
            inline
              ? "relative z-10 flex items-center justify-center w-14 h-14 rounded-full bg-accent shadow-lg shadow-accent/30 active:scale-90 transition-transform touch-manipulation"
              : "absolute bottom-20 right-3 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-accent shadow-lg shadow-accent/30 active:scale-90 transition-transform touch-manipulation"
          }
        >
          <span className="text-[11px] font-black text-background tracking-wide">SPYN</span>
        </button>
      </div>

      {/* Result popup */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={
              inline
                ? "absolute bottom-full right-0 mb-2 z-30 max-w-[220px] rounded-xl bg-black/80 backdrop-blur-md px-4 py-3 border border-accent/30 shadow-xl"
                : "absolute bottom-36 right-3 z-30 max-w-[220px] rounded-xl bg-black/80 backdrop-blur-md px-4 py-3 border border-accent/30 shadow-xl"
            }
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
            className={
              inline
                ? "absolute bottom-full right-0 mb-2 z-30 rounded-xl bg-red-500/20 backdrop-blur-sm px-3 py-2 border border-red-500/30"
                : "absolute bottom-36 right-3 z-30 rounded-xl bg-red-500/20 backdrop-blur-sm px-3 py-2 border border-red-500/30"
            }
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
            className={
              inline
                ? "absolute bottom-full right-0 mb-2 z-30 rounded-xl bg-accent/20 backdrop-blur-sm px-3 py-2 border border-accent/30"
                : "absolute bottom-36 right-3 z-30 rounded-xl bg-accent/20 backdrop-blur-sm px-3 py-2 border border-accent/30"
            }
          >
            <p className="text-xs text-accent font-medium animate-pulse">Écoute{attempt > 1 ? ` (${attempt}/6)` : ""}...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
