"use client";

import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  src?: string;
  stream?: MediaStream | null;
}

export default function VideoPlayer({ src, stream }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Mode WebRTC : stream MediaStream directement
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Cleanup HLS si actif
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(false);
    setRetryCount(0);
    video.srcObject = stream;
    video.play().catch(() => {});

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Mode HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || stream) return;

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
              // Cloudflare manifest may not be ready yet — wait 3s before retrying
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
      // Safari HLS natif — retry si le manifest n'est pas encore prêt
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
  }, [src, stream]);

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
        muted={!stream}
      />
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-sm text-white/80">Chargement du stream...</p>
          {retryCount > 0 && (
            <p className="text-xs text-white/50 mt-1">Tentative {retryCount}...</p>
          )}
        </div>
      )}
    </div>
  );
}
