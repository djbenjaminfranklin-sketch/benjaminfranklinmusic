"use client";

import { Play, Pause, SkipBack, SkipForward, X, Share2 } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";

export default function MiniPlayer() {
  const {
    track,
    playing,
    progress,
    currentTime,
    duration,
    queue,
    pause,
    resume,
    seek,
    dismiss,
    playNext,
    playPrev,
  } = usePlayer();
  const config = useSiteConfig();

  if (!track) return null;

  const hasQueue = queue.length > 1;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * duration);
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[999]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="bg-card/95 backdrop-blur-xl border-t border-border">
        {/* Row 1: Cover + Info + Controls */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          {/* Cover */}
          <img
            src={track.coverUrl}
            alt={track.title}
            className="w-11 h-11 rounded-lg object-cover shrink-0"
          />

          {/* Title + Artist */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary truncate">
              {track.title}
            </p>
            <p className="text-xs text-foreground/40 truncate">
              {config.artist.name}
            </p>
          </div>

          {/* Prev */}
          <button
            onClick={playPrev}
            className={`shrink-0 w-8 h-8 flex items-center justify-center transition-colors ${
              hasQueue
                ? "text-foreground/60 hover:text-primary"
                : "text-foreground/20"
            }`}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={playing ? pause : resume}
            className="shrink-0 w-11 h-11 rounded-full bg-accent flex items-center justify-center text-background hover:bg-accent/90 transition-colors"
          >
            {playing ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={playNext}
            className={`shrink-0 w-8 h-8 flex items-center justify-center transition-colors ${
              hasQueue
                ? "text-foreground/60 hover:text-primary"
                : "text-foreground/20"
            }`}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="shrink-0 w-7 h-7 flex items-center justify-center text-foreground/30 hover:text-foreground/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: Progress */}
        <div className="px-4 pb-3 flex items-center gap-2.5">
          <span className="text-[10px] text-foreground/40 tabular-nums w-7 text-right">
            {fmt(currentTime)}
          </span>
          <div
            onClick={handleProgressClick}
            className="flex-1 h-1.5 rounded-full bg-border/50 cursor-pointer"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-foreground/40 tabular-nums w-7">
            {duration ? fmt(duration) : "--:--"}
          </span>
          <button
            onClick={share}
            className="shrink-0 w-6 h-6 flex items-center justify-center text-foreground/30 hover:text-accent transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
