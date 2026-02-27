"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PermissionDialog from "@/shared/ui/PermissionDialog";

interface TrackResult {
  artist: string;
  title: string;
  album?: string;
  spotify_url?: string | null;
}

interface SpynButtonProps {
  inline?: boolean;
  audioDeviceId?: string | null;
  /** Pass a live stream to capture its audio directly (no mic needed) */
  audioStream?: MediaStream | null;
}

export default function SpynButton({ inline = false, audioDeviceId, audioStream }: SpynButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showPermDialog, setShowPermDialog] = useState(false);
  const cancelledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Convert Blob to base64 string (same approach as SPYNNERS)
  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // FileReader returns "data:audio/webm;base64,<data>" — extract just the base64 part
        const base64 = dataUrl.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // Record 12 seconds of audio and send to ACRCloud as base64
  const recordAndIdentify = useCallback(async (stream: MediaStream): Promise<TrackResult | null> => {
    return new Promise((resolve) => {
      // Pick best supported mime type
      let mimeType = "";
      for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]) {
        if (MediaRecorder.isTypeSupported(mime)) {
          mimeType = mime;
          break;
        }
      }

      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (err) {
        resolve({ _error: `Recorder error: ${err}` } as unknown as TrackResult);
        return;
      }
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = () => {
        resolve({ _error: "Recording error" } as unknown as TrackResult);
      };

      recorder.onstop = async () => {
        if (chunks.length === 0) {
          resolve({ _error: "No audio data" } as unknown as TrackResult);
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

        if (blob.size < 1000) {
          resolve({ _error: `Audio too small (${blob.size}b)` } as unknown as TrackResult);
          return;
        }

        try {
          // Convert to base64 (same as SPYNNERS)
          const audioBase64 = await blobToBase64(blob);

          if (!audioBase64 || audioBase64.length < 100) {
            resolve({ _error: "Empty base64" } as unknown as TrackResult);
            return;
          }

          // Send as JSON with base64 audio
          const res = await fetch("/api/live/identify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio_data: audioBase64,
              sample_rate: 48000,
              channels: 1,
            }),
          });

          const data = await res.json();
          if (res.ok) {
            resolve(data);
            return;
          }
          if (res.status === 503) {
            resolve({ _error: "ACRCloud not configured" } as unknown as TrackResult);
            return;
          }
          if (res.status === 404) {
            // No track found — retry silently
            resolve(null);
            return;
          }
          // Real error — show message
          resolve({ _error: data.error || `Error ${res.status}` } as unknown as TrackResult);
        } catch (err) {
          resolve({ _error: `Network: ${err}` } as unknown as TrackResult);
        }
      };

      // Collect data every second, record for 12 seconds (same as SPYNNERS)
      recorder.start(1000);

      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 12000);
    });
  }, [blobToBase64]);

  const identify = useCallback(async () => {
    // If already listening, cancel
    if (isListening) {
      cancelledRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      // Don't stop the live stream tracks — only stop if it's a mic we opened
      if (!audioStream) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
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
      let stream: MediaStream;
      let ownsStream = false; // Whether we need to stop the stream when done

      if (audioStream && audioStream.getAudioTracks().length > 0) {
        // Use the live stream audio directly (internal audio capture, like Shazam)
        // Create a new stream with only the audio tracks so MediaRecorder works
        stream = new MediaStream(audioStream.getAudioTracks());
        ownsStream = false; // Don't stop — it's the live stream
      } else {
        // Fallback to mic (for admin/broadcaster)
        const audioConstraints: MediaStreamConstraints["audio"] = audioDeviceId
          ? { deviceId: { exact: audioDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        ownsStream = true;
      }
      streamRef.current = stream;

      // Loop: record + identify, retry up to 5 times (60 seconds max)
      const maxAttempts = 5;
      for (let i = 0; i < maxAttempts; i++) {
        if (cancelledRef.current) break;
        setAttempt(i + 1);

        // Create a fresh MediaStream for each attempt (reusing can produce empty blobs)
        const recordStream = audioStream && audioStream.getAudioTracks().length > 0
          ? new MediaStream(audioStream.getAudioTracks())
          : stream;

        const track = await recordAndIdentify(recordStream);

        if (cancelledRef.current) break;

        // Check for config/fatal error — stop immediately, don't retry
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (track && (track as any)._error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((track as any)._error);
          setTimeout(() => setError(null), 6000);
          break;
        }

        if (track) {
          setResult(track);
          setTimeout(() => setResult(null), 10000);
          break;
        }

        // Last attempt failed — show message
        if (i === maxAttempts - 1) {
          setError("No track detected");
          setTimeout(() => setError(null), 4000);
        }
      }

      // Cleanup — only stop the stream if we created it (mic)
      if (ownsStream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    } catch {
      setError("Microphone access denied");
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsListening(false);
      setAttempt(0);
    }
  }, [isListening, recordAndIdentify, audioDeviceId, audioStream]);

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
          onClick={() => {
            if (isListening) {
              identify();
            } else if (audioStream && audioStream.getAudioTracks().length > 0) {
              identify();
            } else {
              setShowPermDialog(true);
            }
          }}
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
            <p className="text-xs text-accent font-medium animate-pulse">Écoute{attempt > 1 ? ` (${attempt}/5)` : ""}...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <PermissionDialog
        type="microphone"
        open={showPermDialog}
        onAllow={() => {
          setShowPermDialog(false);
          identify();
        }}
        onDeny={() => setShowPermDialog(false)}
      />
    </div>
  );
}
