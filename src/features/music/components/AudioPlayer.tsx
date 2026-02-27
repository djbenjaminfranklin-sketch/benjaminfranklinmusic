"use client";

import { Play, Pause, Share2, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePlayer } from "../context/PlayerContext";

interface AudioPlayerProps {
  src: string;
  title: string;
  coverUrl: string;
}

export default function AudioPlayer({ src, title, coverUrl }: AudioPlayerProps) {
  const t = useTranslations("music");
  const { track, playing, progress, currentTime, duration, playTrack, seek } =
    usePlayer();

  const isActive = track?.src === src;
  const isPlaying = isActive && playing;
  const displayProgress = isActive ? progress : 0;
  const displayCurrentTime = isActive ? currentTime : 0;
  const displayDuration = isActive ? duration : 0;

  const toggle = () => {
    playTrack(src, title, coverUrl);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || !displayDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * displayDuration);
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
      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="shrink-0 w-8 h-8 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center text-accent hover:bg-accent/25 transition-colors"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Progress bar + time */}
      <div className="flex-1 flex flex-col gap-1">
        <div
          onClick={handleSeek}
          className="relative h-1.5 rounded-full bg-border cursor-pointer group"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
            style={{ width: `${displayProgress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${displayProgress}%`, marginLeft: -6 }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-foreground/30 tabular-nums">
          <span>{fmt(displayCurrentTime)}</span>
          <span>{displayDuration ? fmt(displayDuration) : "--:--"}</span>
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
