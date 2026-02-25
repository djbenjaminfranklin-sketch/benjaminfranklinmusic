"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Video, VideoOff, Eye, Mic, MicOff, UserPlus, Camera, SwitchCamera, Minimize2, LayoutGrid, Shuffle, MapPin, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";
import LiveChatOverlay from "@/components/live/LiveChatOverlay";
import type { LiveChatMessage } from "@/types";

interface CameraBroadcastProps {
  venue?: string;
  isLiveAlready?: boolean;
  externalCoHostStreams?: Map<string, MediaStream>;
  chatMessages?: LiveChatMessage[];
  onSendChat?: (author: string, content: string, djPassword?: string) => Promise<void>;
  currentTrack?: { artist: string; title: string } | null;
}

function StreamBand({ stream, label, mirror }: { stream: MediaStream; label: string; mirror?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);

  return (
    <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        style={{ transform: mirror ? "scaleX(-1)" : undefined }}
        playsInline
        muted
        autoPlay
      />
      <div className="absolute bottom-2 left-2 z-10">
        <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
          {label}
        </span>
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CameraBroadcast({ venue, isLiveAlready, externalCoHostStreams, chatMessages, onSendChat, currentTrack }: CameraBroadcastProps) {
  const {
    isBroadcasting,
    isCoHost,
    localStream,
    viewerCount,
    error,
    startBroadcast,
    stopBroadcast,
    joinAsCoHost,
    leaveCoHost,
    guestStreams,
    inviteRandomViewer,
    inviting,
    disconnectGuest,
    switchCamera,
    facingMode,
    isMuted,
    toggleMute,
    guestNames,
  } = useLiveBroadcast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");

  // --- Fullscreen mode (start inline so admin can see co-host link, ACR, etc.) ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Broadcast mode: multicam (all cameras side by side) or director (auto-switch) ---
  const [broadcastMode, setBroadcastMode] = useState<"multicam" | "director">("director");

  // --- Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(() => {
    if (!localStream) return;
    recordedChunksRef.current = [];
    setRecordingTime(0);

    // Use MP4 on Safari/iOS, fallback to WebM
    const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm"
      : "";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";

    const mr = new MediaRecorder(localStream, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/mp4" });
      const filename = `live-${new Date().toISOString().slice(0, 19)}.${ext}`;
      const file = new File([blob], filename, { type: mimeType || "video/mp4" });

      // On mobile, use share sheet (save to phone)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).catch(() => {});
      } else {
        // Fallback: download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setIsRecording(true);

    // Start counter
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  }, [localStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // Auto-stop recording when broadcast stops
  useEffect(() => {
    if (!isBroadcasting && isRecording) {
      stopRecording();
    }
  }, [isBroadcasting, isRecording, stopRecording]);

  // --- Guest join notification ---
  const [guestNotification, setGuestNotification] = useState<string | null>(null);
  const prevGuestCountRef = useRef(0);

  useEffect(() => {
    const currentCount = guestStreams.size;
    if (currentCount > prevGuestCountRef.current) {
      const guestIds = Array.from(guestStreams.keys());
      const newestGuest = guestIds[guestIds.length - 1];
      const name = guestNames.get(newestGuest) || newestGuest.slice(0, 8);
      setGuestNotification(tLive("guestJoined", { name }));
      setTimeout(() => setGuestNotification(null), 4000);
    }
    prevGuestCountRef.current = currentCount;
  }, [guestStreams, guestNames, tLive]);

  // Afficher le preview local
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (localStream) {
      video.srcObject = localStream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [localStream]);

  // Merge guest streams (from useLiveBroadcast) + external co-host streams (from useLiveStream)
  const allCoHostStreams = new Map<string, MediaStream>();
  guestStreams.forEach((s, id) => allCoHostStreams.set(id, s));
  externalCoHostStreams?.forEach((s, id) => {
    if (!allCoHostStreams.has(id)) allCoHostStreams.set(id, s);
  });
  const coHostEntries = Array.from(allCoHostStreams.entries());

  // --- Director auto-switch mode ---
  // Build list of all available streams: [{ id, stream, label, mirror }]
  const allStreams = [
    ...(localStream ? [{ id: "local", stream: localStream, label: tLive("angleMain"), mirror: facingMode === "user" }] : []),
    ...coHostEntries.map(([id], i) => ({
      id,
      stream: allCoHostStreams.get(id)!,
      label: guestNames.get(id) || tLive("angleNumber", { n: i + 2 }),
      mirror: false,
    })),
  ];
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);

  // Auto-switch every 6 seconds when multiple cameras (director mode only)
  useEffect(() => {
    if (allStreams.length <= 1 || broadcastMode !== "director") return;
    const interval = setInterval(() => {
      setActiveStreamIndex((prev) => (prev + 1) % allStreams.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [allStreams.length, broadcastMode]);

  // Clamp index if streams change
  const safeIndex = allStreams.length > 0 ? activeStreamIndex % allStreams.length : 0;
  const currentDirectorStream = allStreams[safeIndex];

  // --- Fullscreen broadcasting view ---
  if (isBroadcasting && localStream && isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        {/* Multicam: all cameras side by side / Director: single auto-switching camera */}
        {broadcastMode === "multicam" ? (
          <div className="flex flex-row w-full h-full gap-0.5">
            {allStreams.map((s) => (
              <StreamBand key={s.id} stream={s.stream} label={s.label} mirror={s.mirror} />
            ))}
          </div>
        ) : (
          currentDirectorStream && (
            <StreamBand
              key={currentDirectorStream.id}
              stream={currentDirectorStream.stream}
              label={currentDirectorStream.label}
              mirror={currentDirectorStream.mirror}
            />
          )
        )}

        {/* Camera indicator dots (director mode only) */}
        {broadcastMode === "director" && allStreams.length > 1 && (
          <div className="absolute top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5">
            {allStreams.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActiveStreamIndex(i)}
                className={cn(
                  "rounded-full transition-all",
                  i === safeIndex ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40"
                )}
              />
            ))}
          </div>
        )}

        {/* Top overlays — pushed down for Dynamic Island, z-40 to stay above chat overlay */}
        <div className="absolute top-0 left-0 right-0 z-40 p-4 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1rem))] flex items-start justify-between">
          {/* Left: LIVE badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">LIVE</span>
          </div>

          {/* Right: record + mode toggle + viewers + minimize */}
          <div className="flex items-center gap-2">
            {/* Record button with counter */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-2 border border-white/10 active:scale-95 transition-transform min-h-[40px] touch-manipulation"
            >
              {isRecording ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-400 tabular-nums">{formatTime(recordingTime)}</span>
                </>
              ) : (
                <span className="w-3.5 h-3.5 rounded-full bg-red-500" />
              )}
            </button>
            {/* Multicam / Director toggle — only when multiple streams */}
            {allStreams.length > 1 && (
              <div className="flex items-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 p-1">
                <button
                  onClick={() => setBroadcastMode("multicam")}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all touch-manipulation",
                    broadcastMode === "multicam" ? "bg-white/25" : "active:bg-white/10"
                  )}
                >
                  <LayoutGrid className="h-4 w-4 text-white" />
                </button>
                <button
                  onClick={() => setBroadcastMode("director")}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all touch-manipulation",
                    broadcastMode === "director" ? "bg-white/25" : "active:bg-white/10"
                  )}
                >
                  <Shuffle className="h-4 w-4 text-white" />
                </button>
              </div>
            )}
            {/* Viewer count */}
            <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-2 border border-white/10 min-h-[40px]">
              <Eye className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold text-white tabular-nums">{viewerCount}</span>
            </div>
            {/* Minimize */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            >
              <Minimize2 className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Guest join notification */}
        {guestNotification && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 rounded-full bg-accent/90 backdrop-blur-sm px-4 py-2 animate-bounce">
            <span className="text-sm font-bold text-background">{guestNotification}</span>
          </div>
        )}

        {/* Venue + current track — bottom left, above chat */}
        {(venue || currentTrack) && (
          <div className="absolute bottom-32 left-4 z-40 flex flex-col gap-1">
            {venue && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10 w-fit">
                <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-medium text-white truncate max-w-[200px]">{venue}</span>
              </div>
            )}
            {currentTrack && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10 w-fit">
                <Music className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-medium text-white truncate max-w-[200px]">{currentTrack.artist} — {currentTrack.title}</span>
              </div>
            )}
          </div>
        )}

        {/* Chat overlay — pushed up above bottom controls */}
        {chatMessages && onSendChat && (
          <div className="absolute inset-0 bottom-28 z-20 pointer-events-none">
            <div className="relative w-full h-full pointer-events-auto">
              <LiveChatOverlay messages={chatMessages} onSend={onSendChat} />
            </div>
          </div>
        )}

        {/* Bottom controls — z-40 to stay above chat overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-40 p-6 pb-[max(2rem,calc(env(safe-area-inset-bottom)+0.5rem))] flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
          >
            {isMuted ? (
              <MicOff className="h-6 w-6 text-red-400" />
            ) : (
              <Mic className="h-6 w-6 text-white" />
            )}
          </button>

          {/* Stop */}
          <button
            onClick={isCoHost ? leaveCoHost : stopBroadcast}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
          >
            <VideoOff className="h-7 w-7 text-white" />
          </button>

          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
          >
            <SwitchCamera className="h-6 w-6 text-white" />
          </button>

          {/* Invite viewer */}
          {!isCoHost && (
            <button
              onClick={inviteRandomViewer}
              disabled={inviting}
              className="w-14 h-14 rounded-full bg-accent/20 backdrop-blur-sm border border-accent/30 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 touch-manipulation"
            >
              <UserPlus className="h-6 w-6 text-accent" />
            </button>
          )}
        </div>

        {error && (
          <div className="absolute top-32 left-4 right-4 z-50">
            <p className="text-xs text-red-400 rounded-lg bg-red-500/20 backdrop-blur-sm border border-red-500/30 px-3 py-2">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video preview — inline when not fullscreen or not broadcasting */}
      {isBroadcasting && localStream ? (
        <div className={cn(
          "relative rounded-xl overflow-hidden border border-border bg-black h-[70vh] mx-auto flex gap-0.5 cursor-pointer",
          allStreams.length > 1 ? "flex-row" : "flex-col aspect-[9/16]"
        )} onClick={() => setIsFullscreen(true)}>
          <StreamBand stream={localStream} label={tLive("angleMain")} mirror={facingMode === "user"} />
          {coHostEntries.map(([id], i) => (
            <StreamBand key={id} stream={allCoHostStreams.get(id)!} label={guestNames.get(id) || tLive("angleNumber", { n: i + 2 })} />
          ))}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); isRecording ? stopRecording() : startRecording(); }}
              className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-1.5 border border-white/10"
            >
              {isRecording ? (
                <>
                  <span className="w-2 h-2 rounded-sm bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-red-400 tabular-nums">{formatTime(recordingTime)}</span>
                </>
              ) : (
                <span className="w-3 h-3 rounded-full bg-red-500" />
              )}
            </button>
            <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10">
              <Eye className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-bold text-white tabular-nums">{viewerCount}</span>
            </div>
          </div>
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">LIVE</span>
          </div>
          {/* Tap to fullscreen hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <span className="text-xs text-white/50 bg-black/40 rounded-full px-3 py-1">Tap to fullscreen</span>
          </div>
        </div>
      ) : (
        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-border">
          {localStream ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
                playsInline
                muted
                autoPlay
              />
              <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10">
                <Eye className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs font-bold text-white tabular-nums">{viewerCount}</span>
              </div>
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">LIVE</span>
              </div>
              <button
                onClick={switchCamera}
                className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
              >
                <SwitchCamera className="h-5 w-5 text-white" />
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <VideoOff className="h-12 w-12 text-foreground/15" />
              <p className="text-sm text-foreground/30">{t("cameraPreview")}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
      )}

      {/* Boutons de controle */}
      <div className="flex gap-3">
        {!isBroadcasting ? (
          <>
            {isLiveAlready ? (
              <button
                onClick={() => joinAsCoHost({ video: true, audio: true })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                  "bg-accent text-background hover:bg-accent/90 active:scale-[0.98]"
                )}
              >
                <Camera className="h-4 w-4" />
                {t("joinCoHost")}
              </button>
            ) : (
              <button
                onClick={() => startBroadcast({ video: true, audio: true, venue })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                  "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]"
                )}
              >
                <Video className="h-4 w-4" />
                {t("goLiveCamera")}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={isCoHost ? leaveCoHost : stopBroadcast}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                "bg-foreground/10 border border-border text-foreground/60 hover:bg-foreground/15 active:scale-[0.98]"
              )}
            >
              <VideoOff className="h-4 w-4" />
              {isCoHost ? t("leaveCoHost") : t("stopLiveCamera")}
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className={cn(
                "rounded-xl px-4 py-3 text-sm font-medium border transition-colors",
                "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
              )}
            >
              <Video className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
