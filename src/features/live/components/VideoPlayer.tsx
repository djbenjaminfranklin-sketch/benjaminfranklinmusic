"use client";

import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
  bundlePolicy: "max-bundle",
};

let cachedViewerIce: RTCConfiguration | null = null;
let viewerIceCacheTime = 0;
async function getViewerIceServers(): Promise<RTCConfiguration> {
  if (cachedViewerIce && Date.now() - viewerIceCacheTime < 30 * 60 * 1000) {
    return cachedViewerIce;
  }
  try {
    const res = await fetch("/api/live/turn");
    if (res.ok) {
      const servers = await res.json();
      servers.push({ urls: "stun:stun.cloudflare.com:3478" });
      cachedViewerIce = { iceServers: servers, bundlePolicy: "max-bundle" as const };
      viewerIceCacheTime = Date.now();
      return cachedViewerIce;
    }
  } catch {}
  return DEFAULT_ICE;
}

interface VideoPlayerProps {
  src?: string;
  stream?: MediaStream | null;
  streamType?: "hls" | "whep";
}

/**
 * Perform a WHEP handshake to receive a Cloudflare Stream via WebRTC.
 */
async function whepConnect(
  whepUrl: string,
  video: HTMLVideoElement,
  signal: AbortSignal,
  iceConfig: RTCConfiguration,
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection(iceConfig);

  // Receive-only transceivers
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  pc.ontrack = (event) => {
    if (video.srcObject !== event.streams[0]) {
      video.srcObject = event.streams[0];
      video.play().catch(() => {});
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering (or timeout)
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timeout = setTimeout(resolve, 3000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  if (signal.aborted) {
    pc.close();
    throw new DOMException("Aborted", "AbortError");
  }

  const res = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription!.sdp,
    signal,
  });

  if (!res.ok) {
    pc.close();
    throw new Error(`WHEP handshake failed (${res.status})`);
  }

  const answerSdp = await res.text();
  await pc.setRemoteDescription(
    new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
  );

  return pc;
}

export default function VideoPlayer({ src, stream, streamType }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const whepPcRef = useRef<RTCPeerConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [whepError, setWhepError] = useState<string | null>(null);

  // Mode WebRTC direct : stream MediaStream directement
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Cleanup HLS/WHEP si actif
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (whepPcRef.current) { whepPcRef.current.close(); whepPcRef.current = null; }

    setIsLoading(false);
    setRetryCount(0);
    video.srcObject = stream;
    video.play().catch(() => {});

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Mode WHEP : WebRTC playback via proxy (avoids CORS issues)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || stream || streamType !== "whep") return;

    // Use server-side proxy to avoid CORS with Cloudflare WHEP endpoint
    const whepUrl = "/api/live/whep";

    setIsLoading(true);
    setRetryCount(0);
    setWhepError(null);
    const abortController = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 60;

    const tryConnect = async () => {
      if (abortController.signal.aborted) return;
      attempts++;
      setRetryCount(attempts);
      try {
        console.log(`[WHEP] Attempt ${attempts} — connecting via proxy...`);
        const iceConfig = await getViewerIceServers();
        const pc = await whepConnect(whepUrl, video, abortController.signal, iceConfig);
        whepPcRef.current = pc;
        setIsLoading(false);
        setRetryCount(0);
        setWhepError(null);
        console.log("[WHEP] Connected successfully");

        pc.onconnectionstatechange = () => {
          console.log("[WHEP] Connection state:", pc.connectionState);
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            pc.close();
            whepPcRef.current = null;
            if (!abortController.signal.aborted && attempts < maxAttempts) {
              setIsLoading(true);
              retryTimer = setTimeout(tryConnect, 5000);
            }
          }
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn("[WHEP] Connection failed:", errMsg);

        // 409 = no publisher connected yet, 404 = stream not found
        if (errMsg.includes("409")) {
          setWhepError("waiting");
        } else if (errMsg.includes("404")) {
          setWhepError("not-found");
        } else {
          setWhepError(errMsg);
        }

        if (!abortController.signal.aborted && attempts < maxAttempts) {
          // Wait longer for 409 (publisher not ready) — 5s instead of 3s
          const delay = errMsg.includes("409") ? 5000 : 3000;
          retryTimer = setTimeout(tryConnect, delay);
        } else if (attempts >= maxAttempts) {
          setIsLoading(false);
        }
      }
    };

    tryConnect();

    return () => {
      abortController.abort();
      if (retryTimer) clearTimeout(retryTimer);
      if (whepPcRef.current) {
        whepPcRef.current.close();
        whepPcRef.current = null;
      }
      video.srcObject = null;
      setIsLoading(false);
      setRetryCount(0);
    };
  }, [src, stream, streamType]);

  // Mode HLS (fallback pour les streams non-WHEP)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || stream || streamType === "whep") return;

    setIsLoading(true);
    setRetryCount(0);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        enableWorker: true,
        manifestLoadingMaxRetry: 30,
        manifestLoadingRetryDelay: 2000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setRetryCount(0);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setRetryCount((c) => c + 1);
              retryTimer = setTimeout(() => hls.startLoad(), 3000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setIsLoading(false);
              break;
          }
        }
      });

      return () => {
        if (retryTimer) clearTimeout(retryTimer);
        hls.destroy();
        hlsRef.current = null;
        setIsLoading(false);
        setRetryCount(0);
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari HLS natif
      let safariRetries = 0;
      const maxSafariRetries = 30;

      const tryLoad = () => {
        video.src = src;
        video.load();
      };

      const onMeta = () => {
        setIsLoading(false);
        setRetryCount(0);
        video.play().catch(() => {});
      };

      const onError = () => {
        if (safariRetries < maxSafariRetries) {
          safariRetries++;
          setRetryCount(safariRetries);
          retryTimer = setTimeout(tryLoad, 3000);
        } else {
          setIsLoading(false);
        }
      };

      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
      tryLoad();

      return () => {
        if (retryTimer) clearTimeout(retryTimer);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        setIsLoading(false);
        setRetryCount(0);
      };
    }
  }, [src, stream, streamType]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        controls
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        playsInline
        autoPlay
        muted={!stream && streamType !== "whep"}
      />
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-sm text-white/80">
            {whepError === "waiting"
              ? "En attente du DJ..."
              : whepError === "not-found"
                ? "Stream non disponible"
                : "Chargement du stream..."}
          </p>
          {retryCount > 0 && (
            <p className="text-xs text-white/50 mt-1">
              {whepError === "waiting"
                ? `Connexion en cours... (${retryCount})`
                : `Tentative ${retryCount}...`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
