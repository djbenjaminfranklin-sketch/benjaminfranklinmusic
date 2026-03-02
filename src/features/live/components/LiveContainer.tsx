"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Eye, Wifi, WifiOff, Maximize, Minimize, MapPin, Calendar } from "lucide-react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import siteConfig from "../../../../site.config";
import { useLiveStream } from "@/features/live/hooks/useLiveStream";
import VideoPlayer from "./VideoPlayer";
import TrackDisplay from "./TrackDisplay";
import LiveChat from "./LiveChat";
import LiveChatOverlay from "./LiveChatOverlay";
import AdminPanel from "./AdminPanel";
import LiveMap from "./LiveMap";
import ViewerInviteModal from "./ViewerInviteModal";
import SpynButton from "./SpynButton";

export default function LiveContainer() {
  const {
    chatMessages, viewerCount, streamStatus, isConnected, remoteStream, sendChatMessage,
    scheduledLive,
    pendingInvite, acceptInvite, declineInvite,
    coHostStreams, activeAngle,
  } = useLiveStream();

  const coHostEntries = Array.from(coHostStreams.entries());
  const currentStream = activeAngle === "main" ? remoteStream : coHostStreams.get(activeAngle) || remoteStream;
  const t = useTranslations("live");
  const tCountdown = useTranslations("countdown");
  const locale = useLocale();

  // Countdown timer for scheduled live
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const scheduledDate = useMemo(() => (scheduledLive ? new Date(scheduledLive.date) : null), [scheduledLive]);
  const isSchedulePast = scheduledDate ? scheduledDate.getTime() <= Date.now() : false;
  const showCountdown = !streamStatus.isLive && scheduledLive && !isSchedulePast;

  useEffect(() => {
    if (!scheduledDate || streamStatus.isLive) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const diff = scheduledDate.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(null);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setCountdown({ days, hours, minutes, seconds });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [scheduledDate, streamStatus.isLive]);

  // In WHEP mode, main stream comes via URL (not MediaStream), but it's still a camera
  const hasMainStream = !!remoteStream || !!(streamStatus.isLive && streamStatus.streamType === "whep" && streamStatus.streamUrl);
  const totalCameras = (hasMainStream ? 1 : 0) + coHostEntries.length;
  const getAngleLabel = (angleId: string) => {
    if (angleId === "main") return t("angleMain");
    const idx = coHostEntries.findIndex(([cid]) => cid === angleId);
    return t("angleNumber", { n: idx + 2 });
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  // Container-level mute control (for grid modes where per-cell overlay is wrong)
  const [viewerHasInteracted, setViewerHasInteracted] = useState(false);
  const [viewerMuted, setViewerMuted] = useState(true);

  const handleContainerUnmute = useCallback(() => {
    const container = fullscreenRef.current;
    if (container) {
      container.querySelectorAll("video").forEach((v) => {
        v.muted = false;
        v.play().catch(() => {});
      });
    }
    setViewerHasInteracted(true);
    setViewerMuted(false);
  }, []);

  const toggleContainerMute = useCallback(() => {
    const container = fullscreenRef.current;
    if (container) {
      const newMuted = !viewerMuted;
      container.querySelectorAll("video").forEach((v) => {
        v.muted = newMuted;
      });
      setViewerMuted(newMuted);
    }
  }, [viewerMuted]);

  // Layout: in director mode, always show single WHEP stream.
  // In multicam mode, show grid based on available cameras.
  const isDirectorMode = streamStatus.broadcastMode === "director";
  const effectiveLayout: "single" | "dual" | "quad" =
    isDirectorMode ? "single" :
    totalCameras >= 3 ? "quad" :
    totalCameras >= 2 ? "dual" :
    "single";
  const isGridMode = effectiveLayout === "dual" || effectiveLayout === "quad";
  // Use container-level mute controls when multiple players are mounted (grid or director)
  const useContainerMute = isGridMode || (isDirectorMode && totalCameras >= 2);

  const isLiveHLS = streamStatus.isLive && (streamStatus.streamType === "hls" || streamStatus.streamType === "whep") && streamStatus.streamUrl;
  const isLiveWebRTC = streamStatus.isLive && streamStatus.streamType === "webrtc";
  const isLiveWhep = streamStatus.isLive && streamStatus.streamType === "whep";
  const showVideo = isLiveHLS || (isLiveWebRTC && remoteStream);

  const toggleFullscreen = useCallback(async () => {
    const el = fullscreenRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback : mode plein écran CSS sans l'API Fullscreen
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Synchroniser l'état avec l'API Fullscreen
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  // Échapper pour quitter le plein écran CSS (si l'API Fullscreen n'est pas dispo)
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  return (
    <div className={`min-h-screen bg-background pb-16 ${isLiveWebRTC || isLiveWhep ? "pt-20 sm:pt-24" : "pt-40 sm:pt-24"}`}>
      <div className={`mx-auto ${isLiveWebRTC || isLiveWhep ? "px-0 sm:px-6 max-w-7xl" : "px-4 sm:px-6 max-w-7xl"}`}>
        {/* Header — hidden in portrait live mode */}
        {!isLiveWebRTC && !isLiveWhep && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <Radio className="h-6 w-6 text-accent" />
              <h1 className="text-4xl sm:text-5xl font-bold text-primary">
                {t("title")}
              </h1>
              {streamStatus.isLive && (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/30 px-3 py-1 text-xs font-bold text-red-400 uppercase tracking-wider"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {t("liveNow")}
                </motion.span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {isConnected ? (
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-orange-400" />
                )}
              </div>
            </div>
            <p className="text-foreground/50">{t("subtitle")}</p>
          </motion.div>
        )}

        {/* Main layout: video + chat */}
        <div className={isLiveWebRTC || isLiveWhep ? "flex flex-col gap-6" : "flex flex-col lg:flex-row gap-6"}>
          {/* Video area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={isLiveWebRTC || isLiveWhep ? "w-full flex justify-center" : "lg:w-2/3"}
          >
            {/* Zone vidéo — peut devenir plein écran */}
            <div
              ref={fullscreenRef}
              className={
                isFullscreen
                  ? "fixed inset-0 z-50 bg-black"
                  : isLiveWebRTC || isLiveWhep
                    ? "relative rounded-2xl overflow-hidden border border-border bg-card h-[calc(100dvh-120px)] max-h-[85vh] aspect-[9/16] mx-auto max-w-full"
                    : "relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-card"
              }
            >
              {showVideo ? (
                <>
                  {/* Single angle view */}
                  {effectiveLayout === "single" && !isDirectorMode && (
                    activeAngle !== "main" && coHostStreams.get(activeAngle) ? (
                      <VideoPlayer stream={coHostStreams.get(activeAngle)!} cover={isLiveWebRTC || isLiveWhep} />
                    ) : isLiveHLS ? (
                      <VideoPlayer src={streamStatus.streamUrl!} streamType={streamStatus.streamType as "hls" | "whep"} cover={isLiveWebRTC || isLiveWhep} />
                    ) : currentStream ? (
                      <VideoPlayer stream={currentStream} cover={isLiveWebRTC || isLiveWhep} />
                    ) : null
                  )}
                  {/* Director mode — all players always mounted, switch via CSS visibility */}
                  {isDirectorMode && (
                    <>
                      {/* Main WHEP/WebRTC stream — always mounted */}
                      <div className={`absolute inset-0 transition-opacity duration-500 ${activeAngle === "main" ? "opacity-100 z-[5]" : "opacity-0 z-0 pointer-events-none"}`}>
                        {isLiveHLS ? (
                          <VideoPlayer src={streamStatus.streamUrl!} streamType={streamStatus.streamType as "hls" | "whep"} cover={isLiveWebRTC || isLiveWhep} hideMuteControls />
                        ) : remoteStream ? (
                          <VideoPlayer stream={remoteStream} cover={isLiveWebRTC || isLiveWhep} hideMuteControls />
                        ) : null}
                      </div>
                      {/* Co-host streams — always mounted */}
                      {coHostEntries.map(([id, stream]) => (
                        <div key={id} className={`absolute inset-0 transition-opacity duration-500 ${activeAngle === id ? "opacity-100 z-[5]" : "opacity-0 z-0 pointer-events-none"}`}>
                          <VideoPlayer stream={stream} cover={isLiveWebRTC || isLiveWhep} hideMuteControls />
                        </div>
                      ))}
                    </>
                  )}
                  {/* Dual — 2 views stacked vertically (portrait-friendly): main + first co-host */}
                  {effectiveLayout === "dual" && (
                    <div className="absolute inset-0 grid grid-rows-2 gap-0.5 bg-black">
                      <div className="relative overflow-hidden">
                        {isLiveHLS ? (
                          <VideoPlayer src={streamStatus.streamUrl!} streamType={streamStatus.streamType as "hls" | "whep"} cover hideMuteControls />
                        ) : remoteStream ? (
                          <VideoPlayer stream={remoteStream} cover hideMuteControls />
                        ) : null}
                        <div className="absolute bottom-2 left-2 z-10">
                          <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                            {getAngleLabel("main")}
                          </span>
                        </div>
                      </div>
                      {coHostEntries[0] && (
                        <div className="relative overflow-hidden">
                          <VideoPlayer stream={coHostEntries[0][1]} cover hideMuteControls />
                          <div className="absolute bottom-2 left-2 z-10">
                            <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                              {getAngleLabel(coHostEntries[0][0])}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Quad — 2x2 grid for 3 or 4 cameras */}
                  {effectiveLayout === "quad" && (
                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 bg-black">
                      {/* Main stream */}
                      <div className="relative overflow-hidden">
                        {isLiveHLS ? (
                          <VideoPlayer src={streamStatus.streamUrl!} streamType={streamStatus.streamType as "hls" | "whep"} cover hideMuteControls />
                        ) : remoteStream ? (
                          <VideoPlayer stream={remoteStream} cover hideMuteControls />
                        ) : null}
                        <div className="absolute bottom-2 left-2 z-10">
                          <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                            {getAngleLabel("main")}
                          </span>
                        </div>
                      </div>
                      {/* Co-host streams */}
                      {coHostEntries.slice(0, 3).map(([id, stream]) => (
                        <div key={id} className="relative overflow-hidden">
                          <VideoPlayer stream={stream} cover hideMuteControls />
                          <div className="absolute bottom-2 left-2 z-10">
                            <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                              {getAngleLabel(id)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Container-level mute overlay for grid/director modes */}
                  {useContainerMute && !viewerHasInteracted && (
                    <button
                      onClick={handleContainerUnmute}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 transition-opacity"
                    >
                      <div className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-3 border border-white/30">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                        <span className="text-sm font-semibold text-white">Appuyer pour le son</span>
                      </div>
                    </button>
                  )}
                  {/* Container-level mute toggle button for grid/director modes (after interaction) */}
                  {useContainerMute && viewerHasInteracted && (
                    <button
                      onClick={toggleContainerMute}
                      className="absolute top-14 left-4 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-95 transition-transform pointer-events-auto"
                    >
                      {viewerMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      )}
                    </button>
                  )}
                  {/* Venue display */}
                  {streamStatus.venue && (
                    <div className="absolute bottom-20 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10">
                      <span className="text-[10px] text-white/70">📍</span>
                      <span className="text-xs font-medium text-white">{streamStatus.venue}</span>
                    </div>
                  )}
                  {/* Track display — adapté au fullscreen */}
                  <TrackDisplay track={streamStatus.currentTrack} />

                  {/* Spyn detection button — captures live stream audio directly */}
                  <SpynButton audioStream={remoteStream} />

                  {/* Chat overlay style Instagram Live */}
                  <LiveChatOverlay
                    messages={chatMessages}
                    onSend={sendChatMessage}
                  />
                </>
              ) : streamStatus.isLive && streamStatus.streamType === "webrtc" && !remoteStream ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card">
                  <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-foreground/40">{t("connecting")}</p>
                </div>
              ) : showCountdown && countdown ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  <Image
                    src={siteConfig.assets.heroImage}
                    alt=""
                    fill
                    className="object-cover object-[center_30%] opacity-25"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/60" />
                  <div className="relative flex flex-col items-center gap-6">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Calendar className="h-5 w-5 text-accent" />
                      <h2 className="text-lg font-bold text-accent">{t("nextLive")}</h2>
                    </motion.div>

                    {/* Countdown */}
                    <div className="flex items-center gap-3 sm:gap-5">
                      {countdown.days > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">{countdown.days}</span>
                          <span className="text-[10px] uppercase text-foreground/40 tracking-wider">{tCountdown("days")}</span>
                        </div>
                      )}
                      <div className="flex flex-col items-center">
                        <span className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">{String(countdown.hours).padStart(2, "0")}</span>
                        <span className="text-[10px] uppercase text-foreground/40 tracking-wider">{tCountdown("hours")}</span>
                      </div>
                      <span className="text-2xl font-bold text-foreground/20">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">{String(countdown.minutes).padStart(2, "0")}</span>
                        <span className="text-[10px] uppercase text-foreground/40 tracking-wider">{tCountdown("minutes")}</span>
                      </div>
                      <span className="text-2xl font-bold text-foreground/20">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">{String(countdown.seconds).padStart(2, "0")}</span>
                        <span className="text-[10px] uppercase text-foreground/40 tracking-wider">{tCountdown("seconds")}</span>
                      </div>
                    </div>

                    {/* Venue & date */}
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="text-sm text-foreground/50 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {scheduledLive!.venue}, {scheduledLive!.city}
                      </p>
                      <p className="text-xs text-foreground/30">
                        {new Date(scheduledLive!.date).toLocaleDateString(locale, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  <Image
                    src={siteConfig.assets.heroImage}
                    alt=""
                    fill
                    className="object-cover object-[center_30%] opacity-25"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/60" />
                  <div className="relative flex flex-col items-center gap-4">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <WifiOff className="h-16 w-16 text-foreground/15" />
                    </motion.div>
                    <h2 className="text-xl font-bold text-foreground/40">
                      {t("noLive")}
                    </h2>
                    <p className="text-sm text-foreground/25 max-w-sm text-center">
                      {t("noLiveMessage")}
                    </p>
                  </div>
                </div>
              )}

              {/* Overlays en haut : viewers + fullscreen */}
              <AnimatePresence>
                {streamStatus.isLive && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-4 right-4 flex items-center gap-2 z-30"
                  >
                    <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10">
                      <Eye className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {viewerCount}
                      </span>
                    </div>
                    {showVideo && (
                      <button
                        onClick={toggleFullscreen}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-black/80 transition-colors"
                        title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
                      >
                        {isFullscreen ? (
                          <Minimize className="h-3.5 w-3.5 text-white" />
                        ) : (
                          <Maximize className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Badge LIVE en haut à gauche */}
              {showVideo && streamStatus.isLive && (
                <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">LIVE</span>
                  </div>
                </div>
              )}

            </div>

            {/* Map when DJ location is available — hidden in portrait mode (WHEP/WebRTC) where venue badge is shown */}
            {streamStatus.isLive && streamStatus.location && !isLiveWebRTC && !isLiveWhep && (
              <LiveMap lat={streamStatus.location.lat} lng={streamStatus.location.lng} />
            )}

            {/* Admin panel under video */}
            <div className="mt-6">
              <AdminPanel status={streamStatus} />
            </div>
          </motion.div>

          {/* Chat sidebar (1/3) — hidden in portrait mode (WHEP/WebRTC) where overlay chat is used */}
          {!isLiveWebRTC && !isLiveWhep && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:w-1/3"
            >
              <div className="rounded-2xl border border-border bg-card h-[500px] lg:h-[calc(56.25vw*2/3+1.5rem)] lg:max-h-[600px] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground">{t("liveChat")}</h3>
                  <span className="text-xs text-foreground/40">
                    {t("connected", { count: viewerCount })}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <LiveChat messages={chatMessages} onSend={sendChatMessage} />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Viewer invite modal */}
      <AnimatePresence>
        {pendingInvite && (
          <ViewerInviteModal
            inviteId={pendingInvite.inviteId}
            onAccept={acceptInvite}
            onDecline={declineInvite}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
