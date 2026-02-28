"use client";

import { useState, useEffect } from "react";
import { MapPin, Eye, Link, Copy, Check, Calendar, Share2, X, ImagePlus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useLiveStream, type ScheduledLiveData } from "@/features/live/hooks/useLiveStream";
import { usePlacesSearch } from "@/shared/hooks/usePlacesSearch";
import CameraBroadcast from "./CameraBroadcast";
import CameraBroadcastWhip from "./CameraBroadcastWhip";

const useCloudflareStream = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_ENABLED === "true";

export default function LiveControlPanel() {
  const { streamStatus, viewerCount, scheduledLive: liveScheduledLive, coHostStreams: viewerCoHostStreams, chatMessages, sendChatMessage } = useLiveStream();
  const { results: scheduleVenueResults, isSearching: isScheduleSearching, search: searchScheduleVenues } = usePlacesSearch();
  const [error, setError] = useState("");
  const [coHostCode, setCoHostCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");
  const locale = useLocale();

  // Schedule live state
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleVenueQuery, setScheduleVenueQuery] = useState("");
  const [scheduleCity, setScheduleCity] = useState("");
  const [scheduleFlyerUrl, setScheduleFlyerUrl] = useState("");
  const [uploadingScheduleFlyer, setUploadingScheduleFlyer] = useState(false);
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

  const handleScheduleFlyerUpload = async (file: File) => {
    setUploadingScheduleFlyer(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "flyers");
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setScheduleFlyerUrl(data.url);
    } catch {
      // silently fail
    } finally {
      setUploadingScheduleFlyer(false);
    }
  };

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
          flyerUrl: scheduleFlyerUrl || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule");
      }
      setCurrentSchedule({ date: scheduleDate, venue: scheduleVenueQuery.trim(), city: scheduleCity.trim(), flyerUrl: scheduleFlyerUrl || undefined });
      setScheduleDate("");
      setScheduleVenueQuery("");
      setScheduleCity("");
      setScheduleFlyerUrl("");
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
    const formatted = d.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) + " — " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    const liveUrl = typeof window !== "undefined" ? `${window.location.origin}/${locale}/live` : `/${locale}/live`;
    return `🎧 Benjamin Franklin LIVE!\n📅 ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}\n📍 ${schedule.venue}, ${schedule.city}\n\nJoin the live set 👇\n${liveUrl}`;
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

  // Fetch co-host code on mount (available before live starts)
  useEffect(() => {
    fetch("/api/live/admin")
      .then((r) => r.json())
      .then((data) => {
        if (data.coHostCode) setCoHostCode(data.coHostCode);
      })
      .catch(() => {});
  }, []);


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

              {/* Flyer upload */}
              <div>
                <label className="block text-xs font-medium text-foreground/50 mb-1.5">Flyer</label>
                {scheduleFlyerUrl ? (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border bg-background group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={scheduleFlyerUrl} alt="Flyer" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setScheduleFlyerUrl("")}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-2.5 text-sm font-medium text-purple-400 hover:bg-purple-500/20 transition-colors cursor-pointer w-fit">
                    <ImagePlus className="h-4 w-4" />
                    {uploadingScheduleFlyer ? "..." : t("addImage")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScheduleFlyerUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
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
              <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-3">
                <div className="flex gap-4">
                  {currentSchedule.flyerUrl && (
                    <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-accent/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentSchedule.flyerUrl} alt="Flyer" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-accent">
                      {tLive("scheduledFor")} {new Date(currentSchedule.date).toLocaleDateString(locale, {
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
                </div>
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
                    {copiedShareText ? tLive("copied") : tLive("copy")}
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

      {/* Caméra — Cloudflare WHIP ou WebRTC P2P selon la config */}
      {!streamStatus.isLive || streamStatus.streamType === "webrtc" || (useCloudflareStream && streamStatus.streamType === "hls") ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          {useCloudflareStream ? (
            <CameraBroadcastWhip venue={streamStatus.venue} viewerCount={viewerCount} externalCoHostStreams={viewerCoHostStreams} chatMessages={chatMessages} onSendChat={sendChatMessage} currentTrack={streamStatus.currentTrack} />
          ) : (
            <CameraBroadcast isLiveAlready={streamStatus.isLive} externalCoHostStreams={viewerCoHostStreams} chatMessages={chatMessages} onSendChat={sendChatMessage} currentTrack={streamStatus.currentTrack} venue={streamStatus.venue} />
          )}
        </div>
      ) : null}

      {/* Lien co-host — always visible so admin can share before going live */}
      {coHostCode && (
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

    </div>
  );
}
