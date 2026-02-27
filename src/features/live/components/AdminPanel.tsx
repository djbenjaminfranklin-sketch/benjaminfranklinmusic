"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Radio, Square, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useLiveAdmin } from "@/features/live/hooks/useLiveAdmin";
import type { LiveStreamStatus } from "@/shared/types";

interface AdminPanelProps {
  status: LiveStreamStatus;
}

export default function AdminPanel({ status }: AdminPanelProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useTranslations("live");

  const { goLive, stopLive, updateTrack } = useLiveAdmin();

  // Only show for admin users
  if (!user || user.role !== "admin") return null;

  const handleGoLive = async () => {
    if (!streamUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      await goLive(streamUrl.trim(), "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleStopLive = async () => {
    setLoading(true);
    setError("");
    try {
      await stopLive("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTrack = async () => {
    if (!trackArtist.trim() || !trackTitle.trim()) return;
    setError("");
    try {
      await updateTrack(trackArtist.trim(), trackTitle.trim(), "");
      setTrackArtist("");
      setTrackTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-foreground/5 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground/60">{t("djPanel")}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-foreground/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-foreground/40" />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Stream control */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground/50">{t("hlsStreamUrl")}</label>
            <input
              type="text"
              placeholder={t("hlsPlaceholder")}
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              {!status.isLive ? (
                <button
                  onClick={handleGoLive}
                  disabled={!streamUrl.trim() || loading}
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400",
                    "hover:bg-red-500/30 disabled:opacity-50 transition-colors",
                  )}
                >
                  <Radio className="h-4 w-4" />
                  {t("goLive")}
                </button>
              ) : (
                <button
                  onClick={handleStopLive}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-foreground/10 border border-border px-4 py-2 text-sm font-medium text-foreground/60",
                    "hover:bg-foreground/15 disabled:opacity-50 transition-colors",
                  )}
                >
                  <Square className="h-4 w-4" />
                  {t("stopLive")}
                </button>
              )}
            </div>
          </div>

          {/* Track identification */}
          {status.isLive && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-xs font-medium text-foreground/50">{t("currentTrack")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t("artistPlaceholder")}
                  value={trackArtist}
                  onChange={(e) => setTrackArtist(e.target.value)}
                  className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder={t("titlePlaceholder")}
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={handleUpdateTrack}
                disabled={!trackArtist.trim() || !trackTitle.trim()}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 text-sm font-medium text-accent",
                  "hover:bg-accent/20 disabled:opacity-50 transition-colors",
                )}
              >
                <Music className="h-4 w-4" />
                {t("updateTrack")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
