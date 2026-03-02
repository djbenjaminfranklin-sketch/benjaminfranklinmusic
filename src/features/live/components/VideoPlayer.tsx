"use client";

import { useRef, useEffect, useState, useCallback } from "react";
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
  streamType?: string;
  /** Use object-cover instead of object-contain (fills the container, crops overflow) */
  cover?: boolean;
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

  // Create our own MediaStream — using event.streams[0] from Cloudflare
  // causes 0x0 resolution rendering in Firefox despite frames being decoded.
  const targetStream = new MediaStream();
  video.srcObject = targetStream;

  let playTimer: ReturnType<typeof setTimeout> | null = null;

  pc.ontrack = (event) => {
    console.log("[WHEP] Track received:", event.track.kind, "readyState:", event.track.readyState);
    if (!targetStream.getTrackById(event.track.id)) {
      targetStream.addTrack(event.track);
    }
    video.muted = true;

    // Only call play() once after all tracks arrive
    if (playTimer) clearTimeout(playTimer);
    playTimer = setTimeout(() => {
      video.play().catch((e) => console.warn("[WHEP] play() failed:", e));
    }, 200);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering (5s for TURN candidates)
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timeout = setTimeout(resolve, 5000);
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

  // Log codecs from SDP answer for debugging
  const videoCodecs = answerSdp.match(/a=rtpmap:\d+ (\w+)\/\d+/g);
  console.log("[WHEP] Answer codecs:", videoCodecs?.join(", ") || "none");
  console.log("[WHEP] ICE candidates in answer:", (answerSdp.match(/a=candidate/g) || []).length);

  await pc.setRemoteDescription(
    new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
  );

  return pc;
}

export default function VideoPlayer({ src, stream, streamType, cover }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const whepPcRef = useRef<RTCPeerConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [whepError, setWhepError] = useState<string | null>(null);
  const [isMutedOverlay, setIsMutedOverlay] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const handleUnmute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
    setIsMutedOverlay(false);
    setHasInteracted(true);
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  }, []);

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

  // Mode WHEP : WebRTC playback via proxy — always try for Cloudflare streams
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || stream || streamType === "webrtc") return;

    // Use server-side proxy to avoid CORS with Cloudflare WHEP endpoint
    const whepUrl = "/api/live/whep";

    console.log("[WHEP] useEffect triggered — (re)connecting. src:", src);
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

      // Clean up video element before new connection
      video.pause();
      video.srcObject = null;

      try {
        console.log(`[WHEP] Attempt ${attempts} — connecting via proxy...`);
        const iceConfig = await getViewerIceServers();
        const pc = await whepConnect(whepUrl, video, abortController.signal, iceConfig);
        whepPcRef.current = pc;
        setIsLoading(false);
        setRetryCount(0);
        setWhepError(null);
        setIsMutedOverlay(true);
        console.log("[WHEP] Connected successfully");

        // Monitor WebRTC stats + video element state
        let lastBytesReceived = 0;
        const statsInterval = setInterval(async () => {
          if (pc.connectionState !== "connected") return;
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === "inbound-rtp" && report.kind === "video") {
                const delta = report.bytesReceived - lastBytesReceived;
                console.log(`[WHEP] Video RTP: ${report.bytesReceived} bytes (+${delta}), ${report.framesDecoded || 0} decoded, ${report.framesReceived || 0} received, ${report.frameWidth || "?"}x${report.frameHeight || "?"}`);
                lastBytesReceived = report.bytesReceived;
              }
            });
            // Log video element state
            const ms = video.srcObject as MediaStream | null;
            const vTrack = ms?.getVideoTracks()[0];
            const settings = vTrack?.getSettings();
            console.log(`[WHEP] Video element: ${video.videoWidth}x${video.videoHeight}, paused=${video.paused}, readyState=${video.readyState}, track=${vTrack?.readyState}, trackSize=${settings?.width || "?"}x${settings?.height || "?"}`);
          } catch {}
        }, 3000);

        // Listen for actual video playback instead of checking dimensions
        let videoPlaying = false;
        const onPlaying = () => {
          videoPlaying = true;
          console.log("[WHEP] Video is playing! Resolution:", video.videoWidth, "x", video.videoHeight);
        };
        video.addEventListener("playing", onPlaying, { once: true });

        // If no playback after 20s, reconnect
        const videoCheck = setTimeout(() => {
          video.removeEventListener("playing", onPlaying);
          clearInterval(statsInterval);
          if (!videoPlaying && !abortController.signal.aborted) {
            console.warn("[WHEP] No playback after 20s — reconnecting...");
            pc.close();
            whepPcRef.current = null;
            if (attempts < maxAttempts) {
              setIsLoading(true);
              setIsMutedOverlay(false);
              retryTimer = setTimeout(tryConnect, 2000);
            }
          }
        }, 20000);

        pc.onconnectionstatechange = () => {
          console.log("[WHEP] Connection state:", pc.connectionState);
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            clearTimeout(videoCheck);
            clearInterval(statsInterval);
            video.removeEventListener("playing", onPlaying);
            pc.close();
            whepPcRef.current = null;
            if (!abortController.signal.aborted && attempts < maxAttempts) {
              setIsLoading(true);
              setIsMutedOverlay(false);
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
      console.log("[WHEP] Cleanup — closing previous connection");
      abortController.abort();
      if (retryTimer) clearTimeout(retryTimer);
      if (whepPcRef.current) {
        whepPcRef.current.close();
        whepPcRef.current = null;
      }
      video.srcObject = null;
      setIsLoading(false);
      setRetryCount(0);
      setIsMutedOverlay(false);
    };
  }, [src, stream, streamType]);

  // Mode HLS (fallback — only for non-Cloudflare HLS streams without WHEP proxy)
  useEffect(() => {
    const video = videoRef.current;
    // Skip HLS if WHEP is handling the connection (for all Cloudflare streams)
    if (!video || !src || stream || streamType !== "hls-only") return;

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
        className={`w-full h-full ${cover ? "object-cover" : "object-contain"} bg-black`}
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        playsInline
        autoPlay
        muted
      />
      {isMutedOverlay && (
        <button
          onClick={handleUnmute}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 transition-opacity"
        >
          <div className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-3 border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            <span className="text-sm font-semibold text-white">Appuyer pour le son</span>
          </div>
        </button>
      )}
      {hasInteracted && !isMutedOverlay && (
        <button
          onClick={toggleMute}
          className="absolute top-14 left-4 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-95 transition-transform pointer-events-auto"
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
        </button>
      )}
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
