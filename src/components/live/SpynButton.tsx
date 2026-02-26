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
  audioDeviceId?: string | null;
}

export default function SpynButton({ inline = false, audioDeviceId }: SpynButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Encode PCM float32 samples into a WAV file (Blob)
  const encodeWAV = useCallback((samples: Float32Array, sampleRate: number): Blob => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    // PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
  }, []);

  // Record audio using Web Audio API (works reliably on iOS WKWebView)
  const recordAndIdentify = useCallback(async (stream: MediaStream): Promise<TrackResult | null> => {
    return new Promise(async (resolve) => {
      try {
        const audioCtx = new AudioContext();
        // iOS requires explicit resume after user gesture
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const sampleRate = audioCtx.sampleRate;

        // ScriptProcessor to capture raw PCM (widely supported including WKWebView)
        const bufferSize = 4096;
        const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        const pcmChunks: Float32Array[] = [];
        let hasNonZero = false;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          const input = e.inputBuffer.getChannelData(0);
          pcmChunks.push(new Float32Array(input));
          // Check if we're getting actual audio (not silence)
          if (!hasNonZero) {
            for (let i = 0; i < input.length; i++) {
              if (Math.abs(input[i]) > 0.001) { hasNonZero = true; break; }
            }
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        // Record for 10 seconds
        setTimeout(async () => {
          processor.disconnect();
          source.disconnect();

          // Merge all PCM chunks
          const totalLength = pcmChunks.reduce((acc, c) => acc + c.length, 0);
          const allSamples = new Float32Array(totalLength);
          let pos = 0;
          for (const chunk of pcmChunks) {
            allSamples.set(chunk, pos);
            pos += chunk.length;
          }

          audioCtx.close().catch(() => {});

          if (totalLength < 1000) {
            resolve({ _error: `Audio vide (${totalLength} samples)` } as unknown as TrackResult);
            return;
          }

          if (!hasNonZero) {
            resolve({ _error: "Micro silencieux" } as unknown as TrackResult);
            return;
          }

          const wavBlob = encodeWAV(allSamples, sampleRate);

          const formData = new FormData();
          formData.append("audio", wavBlob, "recording.wav");

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
            if (res.status === 503) {
              resolve({ _error: "ACRCloud non configuré" } as unknown as TrackResult);
              return;
            }
            if (res.status === 404) {
              resolve(null); // No track found, will retry
              return;
            }
            resolve({ _error: `API ${res.status}` } as unknown as TrackResult);
          } catch (err) {
            resolve({ _error: `Réseau: ${err}` } as unknown as TrackResult);
          }
        }, 10000);
      } catch (err) {
        resolve({ _error: `Audio: ${err}` } as unknown as TrackResult);
      }
    });
  }, [encodeWAV]);

  const identify = useCallback(async () => {
    // If already listening, cancel
    if (isListening) {
      cancelledRef.current = true;
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
      const audioConstraints: MediaStreamConstraints["audio"] = audioDeviceId
        ? { deviceId: { exact: audioDeviceId } }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Loop: record + identify, retry up to 6 times (60 seconds max)
      const maxAttempts = 6;
      for (let i = 0; i < maxAttempts; i++) {
        if (cancelledRef.current) break;
        setAttempt(i + 1);

        const track = await recordAndIdentify(stream);

        if (cancelledRef.current) break;

        // Check for config error — stop immediately, don't retry
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
  }, [isListening, recordAndIdentify, audioDeviceId]);

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
