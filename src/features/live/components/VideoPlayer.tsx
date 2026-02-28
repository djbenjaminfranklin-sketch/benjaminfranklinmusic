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

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        enableWorker: true,
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
              hls.startLoad();
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
        hls.destroy();
        hlsRef.current = null;
        setIsLoading(false);
        setRetryCount(0);
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari HLS natif
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
    }
  }, [src, stream]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        controls
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
