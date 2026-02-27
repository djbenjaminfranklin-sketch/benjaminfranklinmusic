"use client";

import { useRef, useEffect } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  src?: string;
  stream?: MediaStream | null;
}

export default function VideoPlayer({ src, stream }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Mode WebRTC : stream MediaStream directement
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Cleanup HLS si actif
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

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
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari HLS natif
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
    }
  }, [src, stream]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-cover"
      controls
      playsInline
      autoPlay
      muted={!stream}
    />
  );
}
