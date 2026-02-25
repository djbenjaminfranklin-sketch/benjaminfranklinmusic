"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Eye, Wifi, WifiOff, Maximize, Minimize, Camera, Circle, Square, Shuffle, MapPin, Calendar } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import siteConfig from "../../../site.config";
import { useLiveStream } from "@/hooks/useLiveStream";
import VideoPlayer from "./VideoPlayer";
import TrackDisplay from "./TrackDisplay";
import LiveChat from "./LiveChat";
import LiveChatOverlay from "./LiveChatOverlay";
import AdminPanel from "./AdminPanel";
import LiveMap from "./LiveMap";
import ViewerInviteModal from "./ViewerInviteModal";

export default function LiveContainer() {
  const {
    chatMessages, viewerCount, streamStatus, isConnected, remoteStream, sendChatMessage,
    scheduledLive,
    pendingInvite, acceptInvite, declineInvite,
    coHostStreams, activeAngle, setActiveAngle,
  } = useLiveStream();

  const coHostEntries = Array.from(coHostStreams.entries());
  const hasMultipleAngles = coHostEntries.length > 0;
  const currentStream = activeAngle === "main" ? remoteStream : coHostStreams.get(activeAngle) || remoteStream;
  const t = useTranslations("live");
  const tCountdown = useTranslations("countdown");

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

  // All available camera streams
  const allStreamEntries = [
    ...(remoteStream ? [{ id: "main", stream: remoteStream }] : []),
    ...coHostEntries.map(([id, stream]) => ({ id, stream })),
  ];
  const totalCameras = allStreamEntries.length;
  const getAngleLabel = (angleId: string) => {
    if (angleId === "main") return t("angleMain");
    const idx = coHostEntries.findIndex(([cid]) => cid === angleId);
    return t("angleNumber", { n: idx + 2 });
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(true);
  const [viewLayout, setViewLayout] = useState<"single" | "dual" | "quad">("single");
  const [dualPair, setDualPair] = useState<[string, string]>(["main", ""]);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Downgrade layout if not enough cameras available
  const effectiveLayout =
    (viewLayout === "quad" && totalCameras < 3) ? (totalCameras >= 2 ? "dual" : "single") :
    (viewLayout === "dual" && totalCameras < 2) ? "single" :
    viewLayout;

  // Auto-switch to multi-angle layout when co-hosts join
  useEffect(() => {
    if (!hasMultipleAngles || autoSwitchEnabled) return;
    if (totalCameras >= 3) {
      setViewLayout("quad");
    } else if (totalCameras >= 2) {
      setViewLayout("dual");
      const ids = allStreamEntries.map((e) => e.id);
      setDualPair([ids[0] || "main", ids[1] || "main"]);
    }
  }, [totalCameras, hasMultipleAngles, autoSwitchEnabled, allStreamEntries]);

  const isLiveHLS = streamStatus.isLive && streamStatus.streamType === "hls" && streamStatus.streamUrl;
  const isLiveWebRTC = streamStatus.isLive && streamStatus.streamType === "webrtc";
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

  // --- Recording ---
  const startRecording = useCallback(() => {
    const stream = currentStream || remoteStream;
    if (!stream) return;
    recordedChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `live-${new Date().toISOString().slice(0, 19)}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  }, [currentStream, remoteStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  // Stop recording when live stops
  useEffect(() => {
    if (!streamStatus.isLive && isRecording) stopRecording();
  }, [streamStatus.isLive, isRecording, stopRecording]);

  // --- Auto-switch cinématique (angles + layouts) ---
  useEffect(() => {
    if (!autoSwitchEnabled || !hasMultipleAngles) return;

    const allAngles = ["main", ...coHostEntries.map(([id]) => id)];

    const pickNext = () => {
      // Build weighted layout pool based on available cameras
      const layouts: ("single" | "dual" | "quad")[] = ["single", "single"];
      if (allAngles.length >= 2) layouts.push("dual", "dual");
      if (allAngles.length >= 3) layouts.push("quad");

      const layout = layouts[Math.floor(Math.random() * layouts.length)];
      setViewLayout(layout);

      if (layout === "single") {
        const idx = Math.floor(Math.random() * allAngles.length);
        setActiveAngle(allAngles[idx]);
      } else if (layout === "dual") {
        const shuffled = [...allAngles].sort(() => Math.random() - 0.5);
        setDualPair([shuffled[0], shuffled[1]]);
      }
      // quad shows all — nothing to pick
    };

    // Random interval between 5-15 seconds
    const scheduleNext = () => {
      const delay = 5000 + Math.random() * 10000;
      return setTimeout(() => {
        pickNext();
        timerRef = scheduleNext();
      }, delay);
    };

    let timerRef = scheduleNext();
    return () => clearTimeout(timerRef);
  }, [autoSwitchEnabled, hasMultipleAngles, coHostEntries, setActiveAngle]);

  return (
    <div className="min-h-screen bg-background pt-40 sm:pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
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

        {/* Main layout: video + chat */}
        <div className={isLiveWebRTC ? "flex flex-col gap-6" : "flex flex-col lg:flex-row gap-6"}>
          {/* Video area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={isLiveWebRTC ? "w-full flex justify-center" : "lg:w-2/3"}
          >
            {/* Zone vidéo — peut devenir plein écran */}
            <div
              ref={fullscreenRef}
              className={
                isFullscreen
                  ? "fixed inset-0 z-50 bg-black"
                  : isLiveWebRTC
                    ? "relative rounded-2xl overflow-hidden border border-border bg-card h-[85vh] aspect-[9/16] mx-auto max-w-full"
                    : "relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-card"
              }
            >
              {showVideo ? (
                <>
                  {/* HLS: always single view */}
                  {isLiveHLS && (
                    <VideoPlayer src={streamStatus.streamUrl!} />
                  )}
                  {/* WebRTC: single angle */}
                  {isLiveWebRTC && effectiveLayout === "single" && currentStream && (
                    <VideoPlayer stream={currentStream} />
                  )}
                  {/* WebRTC: dual — 2 vues côte à côte */}
                  {isLiveWebRTC && effectiveLayout === "dual" && (
                    <div className="absolute inset-0 grid grid-cols-2 gap-0.5 bg-black">
                      {dualPair.map((angleId) => {
                        const s = angleId === "main" ? remoteStream : coHostStreams.get(angleId);
                        return s ? (
                          <div key={angleId} className="relative overflow-hidden">
                            <VideoPlayer stream={s} />
                            <div className="absolute bottom-2 left-2 z-10">
                              <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                                {getAngleLabel(angleId)}
                              </span>
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  {/* WebRTC: multi — 3 ou 4 vues côte à côte */}
                  {isLiveWebRTC && effectiveLayout === "quad" && (
                    <div className={`absolute inset-0 grid gap-0.5 bg-black`} style={{ gridTemplateColumns: `repeat(${Math.min(allStreamEntries.length, 4)}, 1fr)` }}>
                      {allStreamEntries.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="relative overflow-hidden">
                          <VideoPlayer stream={entry.stream} />
                          <div className="absolute bottom-2 left-2 z-10">
                            <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                              {getAngleLabel(entry.id)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
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
                        {new Date(scheduledLive!.date).toLocaleDateString("fr-FR", {
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
                    {/* Record button */}
                    {showVideo && (
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`flex items-center justify-center gap-1 h-8 rounded-full backdrop-blur-sm border transition-colors ${
                          isRecording
                            ? "bg-red-500/80 border-red-500/50 px-3"
                            : "bg-black/60 border-white/10 hover:bg-black/80 w-8"
                        }`}
                        title={isRecording ? t("stopRecording") : t("startRecording")}
                      >
                        {isRecording ? (
                          <>
                            <Square className="h-3 w-3 text-white fill-white" />
                            <span className="text-[10px] font-bold text-white">{t("recording")}</span>
                          </>
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-red-400 fill-red-400" />
                        )}
                      </button>
                    )}
                    {/* Auto-switch button */}
                    {showVideo && hasMultipleAngles && (
                      <button
                        onClick={() => setAutoSwitchEnabled((v) => !v)}
                        className={`flex items-center justify-center gap-1 h-8 rounded-full backdrop-blur-sm border px-2.5 transition-colors ${
                          autoSwitchEnabled
                            ? "bg-accent/80 border-accent/50 text-background"
                            : "bg-black/60 border-white/10 text-white/80 hover:bg-black/80"
                        }`}
                        title={autoSwitchEnabled ? t("autoSwitchOn") : t("autoSwitch")}
                      >
                        <Shuffle className="h-3 w-3" />
                        <span className="text-[10px] font-bold">{autoSwitchEnabled ? "ON" : "AUTO"}</span>
                      </button>
                    )}
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

              {/* Multi-angle switcher + layout buttons */}
              {showVideo && hasMultipleAngles && (
                <>
                  {/* Angle selector (bottom-left) */}
                  <div className="absolute bottom-14 left-4 z-30 flex items-center gap-1.5">
                    <button
                      onClick={() => { setAutoSwitchEnabled(false); setViewLayout("single"); setActiveAngle("main"); }}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        effectiveLayout === "single" && activeAngle === "main"
                          ? "bg-accent text-background border-accent"
                          : "bg-black/60 text-white/80 border-white/10 hover:bg-black/80"
                      }`}
                    >
                      <Camera className="h-3 w-3" />
                      {t("angleMain")}
                    </button>
                    {coHostEntries.map(([id], i) => (
                      <button
                        key={id}
                        onClick={() => { setAutoSwitchEnabled(false); setViewLayout("single"); setActiveAngle(id); }}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                          effectiveLayout === "single" && activeAngle === id
                            ? "bg-accent text-background border-accent"
                            : "bg-black/60 text-white/80 border-white/10 hover:bg-black/80"
                        }`}
                      >
                        <Camera className="h-3 w-3" />
                        {t("angleNumber", { n: i + 2 })}
                      </button>
                    ))}
                  </div>
                  {/* Layout mode buttons (bottom-right) */}
                  <div className="absolute bottom-14 right-4 z-30 flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 p-1">
                    {/* Single */}
                    <button
                      onClick={() => { setAutoSwitchEnabled(false); setViewLayout("single"); }}
                      className={`flex items-center justify-center w-7 h-6 rounded-full transition-colors ${
                        effectiveLayout === "single" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"
                      }`}
                      title={t("layoutSingle")}
                    >
                      <div className="w-3.5 h-2.5 rounded-[2px] border border-current" />
                    </button>
                    {/* Dual — 2 bandes */}
                    {totalCameras >= 2 && (
                      <button
                        onClick={() => {
                          setAutoSwitchEnabled(false);
                          setViewLayout("dual");
                          const ids = allStreamEntries.map(e => e.id);
                          const other = ids.find(id => id !== activeAngle) || ids[0];
                          setDualPair([activeAngle, other]);
                        }}
                        className={`flex items-center justify-center w-7 h-6 rounded-full transition-colors ${
                          effectiveLayout === "dual" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"
                        }`}
                        title={t("layoutDual")}
                      >
                        <div className="flex flex-col gap-px">
                          <div className="w-3 h-1 rounded-[1px] border border-current" />
                          <div className="w-3 h-1 rounded-[1px] border border-current" />
                        </div>
                      </button>
                    )}
                    {/* Multi — 3-4 bandes */}
                    {totalCameras >= 3 && (
                      <button
                        onClick={() => { setAutoSwitchEnabled(false); setViewLayout("quad"); }}
                        className={`flex items-center justify-center w-7 h-6 rounded-full transition-colors ${
                          effectiveLayout === "quad" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"
                        }`}
                        title={t("layoutQuad")}
                      >
                        <div className="flex flex-col gap-px">
                          <div className="w-3 h-[3px] rounded-[1px] border border-current" />
                          <div className="w-3 h-[3px] rounded-[1px] border border-current" />
                          <div className="w-3 h-[3px] rounded-[1px] border border-current" />
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Map when DJ location is available */}
            {streamStatus.isLive && streamStatus.location && (
              <LiveMap lat={streamStatus.location.lat} lng={streamStatus.location.lng} />
            )}

            {/* Admin panel under video */}
            <div className="mt-6">
              <AdminPanel status={streamStatus} />
            </div>
          </motion.div>

          {/* Chat sidebar (1/3) — masqué en plein écran */}
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
