"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Radio, Square, Music, Mic, MapPin, Eye, Video, RefreshCw, Link, Copy, Check, Calendar, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLiveStream, type ScheduledLiveData } from "@/hooks/useLiveStream";
import { useLiveAdmin } from "@/hooks/useLiveAdmin";
import { useACRCloud } from "@/hooks/useACRCloud";
import { usePlacesSearch } from "@/hooks/usePlacesSearch";
import CameraBroadcast from "./CameraBroadcast";

type LiveMode = "camera" | "hls";

export default function LiveControlPanel() {
  const { streamStatus, viewerCount, scheduledLive: liveScheduledLive, coHostStreams: viewerCoHostStreams, chatMessages, sendChatMessage } = useLiveStream();
  const { goLive, stopLive, updateTrack } = useLiveAdmin();
  const { isListening, track: acrTrack, error: acrError, identifyTrack, stopListening } = useACRCloud();
  const { results: venueResults, isSearching, search: searchVenues } = usePlacesSearch();
  const { results: scheduleVenueResults, isSearching: isScheduleSearching, search: searchScheduleVenues } = usePlacesSearch();

  const [liveMode, setLiveMode] = useState<LiveMode>("camera");
  const [streamUrl, setStreamUrl] = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [venueQuery, setVenueQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoIdentifyEnabled, setAutoIdentifyEnabled] = useState(false);
  const [coHostCode, setCoHostCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const autoIdentifyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoTrackRef = useRef<string | null>(null);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");

  // Schedule live state
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleVenueQuery, setScheduleVenueQuery] = useState("");
  const [scheduleCity, setScheduleCity] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<ScheduledLiveData | null>(null);

  // Sync schedule from SSE
  useEffect(() => {
    setCurrentSchedule(liveScheduledLive);
  }, [liveScheduledLive]);

  // Fetch schedule on mount
  useEffect(() => {
    fetch("/api/live/admin")
      .then((r) => r.json())
      .then((data) => {
        if (data.scheduledLive) setCurrentSchedule(data.scheduledLive);
      })
      .catch(() => {});
  }, []);

  const handleScheduleLive = async () => {
    if (!scheduleDate || !scheduleVenueQuery.trim() || !scheduleCity.trim()) return;
    setScheduleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule-live",
          date: scheduleDate,
          venue: scheduleVenueQuery.trim(),
          city: scheduleCity.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule");
      }
      setCurrentSchedule({ date: scheduleDate, venue: scheduleVenueQuery.trim(), city: scheduleCity.trim() });
      setScheduleDate("");
      setScheduleVenueQuery("");
      setScheduleCity("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleCancelSchedule = async () => {
    setScheduleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel-schedule" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      setCurrentSchedule(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setScheduleLoading(false);
    }
  };

  const generateShareText = (schedule: ScheduledLiveData) => {
    const d = new Date(schedule.date);
    const formatted = d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const liveUrl = typeof window !== "undefined" ? `${window.location.origin}/fr/live` : "/fr/live";
    return `🎧 Benjamin Franklin EN LIVE !\n📅 ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}\n📍 ${schedule.venue}, ${schedule.city}\n\nRejoins le set en direct 👇\n${liveUrl}`;
  };

  const handleCopyShareText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedShareText(true);
    setTimeout(() => setCopiedShareText(false), 2000);
  };

  const handleShare = (text: string) => {
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      handleCopyShareText(text);
    }
  };

  // Fetch co-host code when live
  useEffect(() => {
    if (!streamStatus.isLive) {
      setCoHostCode(null);
      return;
    }
    fetch("/api/live/admin")
      .then((r) => r.json())
      .then((data) => {
        if (data.coHostCode) setCoHostCode(data.coHostCode);
      })
      .catch(() => {});
  }, [streamStatus.isLive]);

  const handleGoLiveHLS = async () => {
    if (!streamUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      await goLive(streamUrl.trim(), "", venueQuery.trim() || undefined);
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

  const handleACRIdentify = async () => {
    if (isListening) {
      stopListening();
    } else {
      await identifyTrack();
    }
  };

  // Auto-remplir les champs track quand ACRCloud identifie un morceau
  useEffect(() => {
    if (acrTrack) {
      setTrackArtist(acrTrack.artist);
      setTrackTitle(acrTrack.title);
    }
  }, [acrTrack]);

  // Auto-push du track identifié quand auto-identify est actif
  const autoUpdateTrack = useCallback(async (artist: string, title: string) => {
    const key = `${artist}::${title}`;
    if (key === lastAutoTrackRef.current) return; // Même track, pas besoin de renvoyer
    lastAutoTrackRef.current = key;
    try {
      await updateTrack(artist, title, "");
    } catch {
      // Silencieux en mode auto
    }
  }, [updateTrack]);

  useEffect(() => {
    if (acrTrack && autoIdentifyEnabled) {
      autoUpdateTrack(acrTrack.artist, acrTrack.title);
    }
  }, [acrTrack, autoIdentifyEnabled, autoUpdateTrack]);

  // Boucle d'auto-identification : lance identifyTrack toutes les 45s quand actif
  useEffect(() => {
    if (!autoIdentifyEnabled || !streamStatus.isLive) {
      if (autoIdentifyRef.current) {
        clearTimeout(autoIdentifyRef.current);
        autoIdentifyRef.current = null;
      }
      return;
    }

    const runCycle = () => {
      if (!isListening) {
        identifyTrack();
      }
      // Relancer dans 45s (10s d'enregistrement + 35s de pause)
      autoIdentifyRef.current = setTimeout(runCycle, 45000);
    };

    // Lancer le premier cycle immédiatement
    runCycle();

    return () => {
      if (autoIdentifyRef.current) {
        clearTimeout(autoIdentifyRef.current);
        autoIdentifyRef.current = null;
      }
    };
  }, [autoIdentifyEnabled, streamStatus.isLive, identifyTrack, isListening]);

  // Désactiver l'auto-identify quand le live s'arrête
  useEffect(() => {
    if (!streamStatus.isLive) {
      setAutoIdentifyEnabled(false);
      lastAutoTrackRef.current = null;
    }
  }, [streamStatus.isLive]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">{t("liveControls")}</h1>
        {streamStatus.isLive && (
          <div className="flex items-center gap-2 rounded-full bg-red-500/20 border border-red-500/30 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-400">{tLive("liveNow")}</span>
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-red-500/20">
              <Eye className="h-3 w-3 text-red-400" />
              <span className="text-xs font-bold text-red-400 tabular-nums">{viewerCount}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
      )}

      {/* Programmer le live — visible quand PAS en live */}
      {!streamStatus.isLive && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground/60 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {tLive("scheduleLive")}
          </h3>

          {!currentSchedule ? (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground/50 mb-1.5">{tLive("scheduleDate")}</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div className="relative">
                <label className="block text-xs font-medium text-foreground/50 mb-1.5">{tLive("scheduleVenue")}</label>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-foreground/40" />
                  <input
                    type="text"
                    placeholder={t("venuePlaceholder")}
                    value={scheduleVenueQuery}
                    onChange={(e) => {
                      setScheduleVenueQuery(e.target.value);
                      searchScheduleVenues(e.target.value);
                    }}
                    className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
                  />
                  {isScheduleSearching && (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {scheduleVenueResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-10 max-h-48 overflow-y-auto">
                    {scheduleVenueResults.map((v) => (
                      <button
                        key={v.placeId}
                        onClick={() => {
                          setScheduleVenueQuery(v.name);
                          // Extract city from address
                          const parts = v.address.split(",").map((s) => s.trim());
                          setScheduleCity(parts[1] || parts[0] || "");
                          searchScheduleVenues("");
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-foreground/5 transition-colors border-b border-border/50 last:border-0"
                      >
                        <p className="font-medium text-primary">{v.name}</p>
                        <p className="text-xs text-foreground/40">{v.address}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground/50 mb-1.5">{tLive("scheduleCity")}</label>
                <input
                  type="text"
                  placeholder={tLive("scheduleCity")}
                  value={scheduleCity}
                  onChange={(e) => setScheduleCity(e.target.value)}
                  className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
                />
              </div>

              <button
                onClick={handleScheduleLive}
                disabled={!scheduleDate || !scheduleVenueQuery.trim() || !scheduleCity.trim() || scheduleLoading}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2.5 text-sm font-medium text-accent",
                  "hover:bg-accent/20 disabled:opacity-50 transition-colors"
                )}
              >
                <Calendar className="h-4 w-4" />
                {tLive("schedule")}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {/* Schedule summary */}
              <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-2">
                <p className="text-sm font-medium text-accent">
                  {tLive("scheduledFor")} {new Date(currentSchedule.date).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-foreground/50 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {currentSchedule.venue}, {currentSchedule.city}
                </p>
              </div>

              {/* Share text */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-foreground/50">{tLive("shareText")}</h4>
                <pre className="rounded-lg bg-background border border-border p-3 text-xs text-foreground/70 whitespace-pre-wrap font-sans">
                  {generateShareText(currentSchedule)}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyShareText(generateShareText(currentSchedule))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border transition-colors",
                      copiedShareText
                        ? "bg-green-500/20 border-green-500/30 text-green-400"
                        : "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
                    )}
                  >
                    {copiedShareText ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedShareText ? tLive("copied") : "Copier"}
                  </button>
                  <button
                    onClick={() => handleShare(generateShareText(currentSchedule))}
                    className="flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                  >
                    <Share2 className="h-3 w-3" />
                    {tLive("shareText")}
                  </button>
                </div>
              </div>

              {/* Cancel button */}
              <button
                onClick={handleCancelSchedule}
                disabled={scheduleLoading}
                className="flex items-center gap-2 rounded-lg bg-foreground/5 border border-border px-3 py-2 text-xs font-medium text-foreground/50 hover:bg-foreground/10 transition-colors"
              >
                <X className="h-3 w-3" />
                {tLive("cancelSchedule")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode de diffusion */}
      {!streamStatus.isLive && (
        <div className="flex gap-1 p-1 rounded-lg bg-background border border-border">
          <button
            onClick={() => setLiveMode("camera")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-colors",
              liveMode === "camera"
                ? "bg-card text-primary shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            )}
          >
            <Video className="h-4 w-4" />
            {t("cameraMode")}
          </button>
          <button
            onClick={() => setLiveMode("hls")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-colors",
              liveMode === "hls"
                ? "bg-card text-primary shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            )}
          >
            <Radio className="h-4 w-4" />
            {t("hlsMode")}
          </button>
        </div>
      )}

      {/* Mode Caméra (WebRTC) */}
      {(liveMode === "camera" && !streamStatus.isLive) || (streamStatus.isLive && streamStatus.streamType === "webrtc") ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground/60 mb-4">{t("cameraBroadcast")}</h3>
          <CameraBroadcast venue={venueQuery.trim() || undefined} isLiveAlready={streamStatus.isLive} externalCoHostStreams={viewerCoHostStreams} chatMessages={chatMessages} onSendChat={sendChatMessage} currentTrack={streamStatus.currentTrack} />
        </div>
      ) : null}

      {/* Mode HLS */}
      {(liveMode === "hls" && !streamStatus.isLive) || (streamStatus.isLive && streamStatus.streamType === "hls") ? (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground/60">{t("streamControl")}</h3>

          <div>
            <label className="block text-xs font-medium text-foreground/50 mb-1.5">{tLive("hlsStreamUrl")}</label>
            <input
              type="text"
              placeholder={tLive("hlsPlaceholder")}
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div className="flex gap-2">
            {!streamStatus.isLive ? (
              <button
                onClick={handleGoLiveHLS}
                disabled={!streamUrl.trim() || loading}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400",
                  "hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                )}
              >
                <Radio className="h-4 w-4" />
                {tLive("goLive")}
              </button>
            ) : (
              <button
                onClick={handleStopLive}
                disabled={loading}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-foreground/10 border border-border px-4 py-2.5 text-sm font-medium text-foreground/60",
                  "hover:bg-foreground/15 disabled:opacity-50 transition-colors"
                )}
              >
                <Square className="h-4 w-4" />
                {tLive("stopLive")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Identification du track */}
      {streamStatus.isLive && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground/60">{tLive("currentTrack")}</h3>

          {/* ACRCloud */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleACRIdentify}
              disabled={autoIdentifyEnabled}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors",
                isListening
                  ? "bg-red-500/20 border-red-500/30 text-red-400 animate-pulse"
                  : "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20",
                autoIdentifyEnabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Mic className="h-4 w-4" />
              {isListening ? t("listening") : t("identifyTrack")}
            </button>
            <button
              onClick={() => setAutoIdentifyEnabled((prev) => !prev)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors",
                autoIdentifyEnabled
                  ? "bg-green-500/20 border-green-500/30 text-green-400"
                  : "bg-foreground/5 border-border text-foreground/50 hover:text-foreground"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", autoIdentifyEnabled && "animate-spin")} />
              {autoIdentifyEnabled ? t("autoIdentifyActive") : t("autoIdentify")}
            </button>
            {acrTrack && (
              <span className="text-xs text-foreground/50">
                {acrTrack.artist} - {acrTrack.title}
              </span>
            )}
            {acrError && <span className="text-xs text-red-400">{acrError}</span>}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder={tLive("artistPlaceholder")}
              value={trackArtist}
              onChange={(e) => setTrackArtist(e.target.value)}
              className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder={tLive("titlePlaceholder")}
              value={trackTitle}
              onChange={(e) => setTrackTitle(e.target.value)}
              className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
            />
          </div>

          <button
            onClick={handleUpdateTrack}
            disabled={!trackArtist.trim() || !trackTitle.trim()}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 text-sm font-medium text-accent",
              "hover:bg-accent/20 disabled:opacity-50 transition-colors"
            )}
          >
            <Music className="h-4 w-4" />
            {tLive("updateTrack")}
          </button>
        </div>
      )}

      {/* Lien co-host */}
      {streamStatus.isLive && coHostCode && (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-accent flex items-center gap-2">
            <Link className="h-4 w-4" />
            {t("coHostLink")}
          </h3>
          <p className="text-xs text-foreground/50">{t("coHostLinkDescription")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm font-mono text-primary truncate">
              {typeof window !== "undefined"
                ? `${window.location.origin}/live/cohost?code=${coHostCode}`
                : `/live/cohost?code=${coHostCode}`}
            </code>
            <button
              onClick={() => {
                const url = `${window.location.origin}/live/cohost?code=${coHostCode}`;
                navigator.clipboard.writeText(url);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors",
                copiedLink
                  ? "bg-green-500/20 border-green-500/30 text-green-400"
                  : "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
              )}
            >
              {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-foreground/30 font-mono">Code : {coHostCode}</p>
        </div>
      )}

      {/* Recherche de venue */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground/60">{t("searchVenue")}</h3>

        <div className="relative">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-foreground/40" />
            <input
              type="text"
              placeholder={t("venuePlaceholder")}
              value={venueQuery}
              onChange={(e) => {
                setVenueQuery(e.target.value);
                searchVenues(e.target.value);
              }}
              className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
            />
            {isSearching && (
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {venueResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-10 max-h-48 overflow-y-auto">
              {venueResults.map((v) => (
                <button
                  key={v.placeId}
                  onClick={() => {
                    setVenueQuery(v.name);
                    searchVenues("");
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-foreground/5 transition-colors border-b border-border/50 last:border-0"
                >
                  <p className="font-medium text-primary">{v.name}</p>
                  <p className="text-xs text-foreground/40">{v.address}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
