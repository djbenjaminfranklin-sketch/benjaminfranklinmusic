"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Share2, Download } from "lucide-react";
import { useTranslations } from "next-intl";

// Global event target for exclusive playback — when one player starts, others stop
const playbackBus = typeof window !== "undefined"
  ? (window as unknown as { __audioPlaybackBus?: EventTarget }).__audioPlaybackBus ??= new EventTarget()
  : new EventTarget();

interface AudioPlayerProps {
  src: string;
  title: string;
}

export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const idRef = useRef(Math.random().toString(36).slice(2));
  const t = useTranslations("music");

  // Listen for other players starting — pause this one
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== idRef.current) {
        audioRef.current?.pause();
        setPlaying(false);
      }
    };
    playbackBus.addEventListener("play", handler);
    return () => playbackBus.removeEventListener("play", handler);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      // Notify all other players to stop
      playbackBus.dispatchEvent(new CustomEvent("play", { detail: idRef.current }));
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API not available (insecure context) — use fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2.5">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="shrink-0 w-8 h-8 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center text-accent hover:bg-accent/25 transition-colors"
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Progress bar + time */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          onClick={seek}
          className="relative h-1.5 rounded-full bg-border cursor-pointer group"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%`, marginLeft: -6 }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-foreground/30 tabular-nums">
          <span>{fmt(currentTime)}</span>
          <span>{duration ? fmt(duration) : "--:--"}</span>
        </div>
      </div>

      {/* Share */}
      <button
        onClick={share}
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-foreground/25 hover:text-accent transition-colors"
        title={t("share")}
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>

      {/* Download */}
      <a
        href={src}
        download
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-foreground/25 hover:text-accent transition-colors"
        title={t("download")}
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
