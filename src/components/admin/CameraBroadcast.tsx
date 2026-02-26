"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Video, VideoOff, Eye, Mic, MicOff, UserPlus, Camera, SwitchCamera, Minimize2, LayoutGrid, Shuffle, MapPin, Music, Usb } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";
import LiveChatOverlay from "@/components/live/LiveChatOverlay";
import SpynButton from "@/components/live/SpynButton";
import { useAudioDevices } from "@/hooks/useAudioDevices";
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
    // Ensure video plays (iOS Safari can pause videos silently)
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
    // Also retry play on visibility change (e.g., after React re-mount)
    const interval = setInterval(() => {
      if (video.paused && video.srcObject) tryPlay();
    }, 1000);
    return () => {
      clearInterval(interval);
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="relative flex-1 w-full h-full min-w-0 min-h-0 overflow-hidden bg-black">
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
    replaceAudioSource,
  } = useLiveBroadcast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");

  // Audio device detection (Pioneer mixer, USB interfaces, etc.)
  const { audioSource, audioSourceName, externalDeviceId, internalDeviceId, availableDevices, setAudioSource } = useAudioDevices();
  const hasExternalDevice = !!externalDeviceId;
  // The device ID to use for SpynButton detection (prefer mixer for better audio quality)
  const spynDeviceId = audioSource === "external" || audioSource === "both" ? externalDeviceId : internalDeviceId;

  // Auto-switch broadcast audio when source changes (plug/unplug USB mixer)
  // Track previous values to avoid re-triggering on localStream changes
  const prevAudioRef = useRef({ audioSource, externalDeviceId, internalDeviceId });
  useEffect(() => {
    const prev = prevAudioRef.current;
    const changed = prev.audioSource !== audioSource || prev.externalDeviceId !== externalDeviceId || prev.internalDeviceId !== internalDeviceId;
    prevAudioRef.current = { audioSource, externalDeviceId, internalDeviceId };
    if (changed && isBroadcasting) {
      replaceAudioSource(audioSource, externalDeviceId, internalDeviceId);
    }
  }, [audioSource, externalDeviceId, internalDeviceId, isBroadcasting, replaceAudioSource]);

  // --- Fullscreen mode (start inline so admin can see co-host link, ACR, etc.) ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Broadcast mode: multicam (all cameras side by side) or director (auto-switch) ---
  const [broadcastMode, setBroadcastMode] = useState<"multicam" | "director">("director");

  // --- Recording (canvas compositing to capture all views) ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(() => {
    if (!localStream) return;
    recordedChunksRef.current = [];
    setRecordingTime(0);

    // Create offscreen canvas for compositing all views
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    recordingCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;

    // Create hidden video elements for each stream
    const createVideo = (stream: MediaStream): HTMLVideoElement => {
      const v = document.createElement("video");
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.play().catch(() => {});
      return v;
    };

    const videos = new Map<string, HTMLVideoElement>();
    for (const s of allStreamsRef.current) {
      videos.set(s.id, createVideo(s.stream));
    }
    recordingVideosRef.current = videos;

    // Render loop — draws the current view onto the canvas (director or multicam)
    const render = () => {
      const streams = allStreamsRef.current;
      const mode = broadcastModeRef.current;
      const idx = safeIndexRef.current;

      // Create video elements for any new streams that joined mid-recording
      for (const s of streams) {
        if (!videos.has(s.id)) {
          videos.set(s.id, createVideo(s.stream));
        }
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (mode === "multicam") {
        // Stacked vertically — same as what the user sees on screen
        const count = streams.length || 1;
        const sliceH = canvas.height / count;
        streams.forEach((s, i) => {
          const video = videos.get(s.id);
          if (video && video.readyState >= 2) {
            const vw = video.videoWidth || 1;
            const vh = video.videoHeight || 1;
            const aspect = canvas.width / sliceH;
            const vAspect = vw / vh;
            let sx = 0, sy = 0, sw = vw, sh = vh;
            if (vAspect > aspect) { sw = vh * aspect; sx = (vw - sw) / 2; }
            else { sh = vw / aspect; sy = (vh - sh) / 2; }
            ctx.drawImage(video, sx, sy, sw, sh, 0, i * sliceH, canvas.width, sliceH);
          }
        });
      } else {
        // Director mode — draw the current active stream fullscreen
        const current = streams[idx % streams.length];
        if (current) {
          const video = videos.get(current.id);
          if (video && video.readyState >= 2) {
            const vw = video.videoWidth || 1;
            const vh = video.videoHeight || 1;
            const aspect = canvas.width / canvas.height;
            const vAspect = vw / vh;
            let sx = 0, sy = 0, sw = vw, sh = vh;
            if (vAspect > aspect) { sw = vh * aspect; sx = (vw - sw) / 2; }
            else { sh = vw / aspect; sy = (vh - sh) / 2; }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(render);
    };
    render();

    // Canvas video track
    const canvasStream = canvas.captureStream(30);

    // Mix audio from all streams via AudioContext
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();
    for (const s of allStreamsRef.current) {
      const audioTracks = s.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const source = audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
        source.connect(dest);
      }
    }

    // Combined stream: canvas video + mixed audio
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    // Use MP4 on Safari/iOS, fallback to WebM
    const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm"
      : "";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";

    const mr = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    let saved = false;
    mr.onstop = () => {
      if (saved) return; // Prevent double save
      saved = true;
      const chunks = recordedChunksRef.current;
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mimeType || "video/mp4" });
      if (blob.size < 10000) return;
      const filename = `live-${new Date().toISOString().slice(0, 19)}.${ext}`;
      const file = new File([blob], filename, { type: mimeType || "video/mp4" });

      // On mobile, use share sheet ONLY (don't download)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).catch(() => {});
      }
      // No fallback download — avoids creating extra blank files in WKWebView
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
    // Cleanup canvas compositing
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    recordingVideosRef.current.forEach((v) => { v.srcObject = null; });
    recordingVideosRef.current.clear();
    recordingCanvasRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
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

  // Refs to access latest reactive values from the recording render loop
  const allStreamsRef = useRef(allStreams);
  allStreamsRef.current = allStreams;
  const broadcastModeRef = useRef(broadcastMode);
  broadcastModeRef.current = broadcastMode;
  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;

  // --- Fullscreen broadcasting view ---
  if (isBroadcasting && localStream && isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden touch-none">
        {/* Multicam: all cameras stacked vertically / Director: single auto-switching camera */}
        {broadcastMode === "multicam" ? (
          <div className="flex flex-col w-full h-full gap-0.5">
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
          {/* Left: LIVE badge + venue + track */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">LIVE</span>
            </div>
            {venue && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10 w-fit">
                <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-medium text-white truncate max-w-[200px]">{venue}</span>
              </div>
            )}
            {hasExternalDevice && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-1 border border-white/10 w-fit">
                <Usb className={cn("h-3 w-3 shrink-0", audioSource !== "internal" ? "text-accent" : "text-white/40")} />
                <span className={cn("text-[10px] font-medium", audioSource !== "internal" ? "text-accent" : "text-white/40")}>{audioSourceName}</span>
              </div>
            )}
            {currentTrack && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10 w-fit">
                <Music className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-medium text-white truncate max-w-[200px]">{currentTrack.artist} — {currentTrack.title}</span>
              </div>
            )}
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
            {/* Multicam / Director toggle — always visible, disabled when solo */}
            <div className={cn(
              "flex items-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 p-1",
              allStreams.length <= 1 && "opacity-40"
            )}>
              <button
                onClick={() => allStreams.length > 1 && setBroadcastMode("multicam")}
                disabled={allStreams.length <= 1}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all touch-manipulation",
                  broadcastMode === "multicam" ? "bg-white/25" : "active:bg-white/10",
                  allStreams.length <= 1 && "cursor-not-allowed"
                )}
              >
                <LayoutGrid className="h-4 w-4 text-white" />
              </button>
              <button
                onClick={() => allStreams.length > 1 && setBroadcastMode("director")}
                disabled={allStreams.length <= 1}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all touch-manipulation",
                  broadcastMode === "director" ? "bg-white/25" : "active:bg-white/10",
                  allStreams.length <= 1 && "cursor-not-allowed"
                )}
              >
                <Shuffle className="h-4 w-4 text-white" />
              </button>
            </div>
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

          {/* Audio source toggle — cycle: USB+Micro → USB → Micro */}
          {hasExternalDevice && (
            <button
              onClick={() => {
                const next = audioSource === "both" ? "external" : audioSource === "external" ? "internal" : "both";
                setAudioSource(next);
              }}
              className={cn(
                "w-14 h-14 rounded-full backdrop-blur-sm border flex flex-col items-center justify-center active:scale-95 transition-transform touch-manipulation gap-0.5",
                audioSource !== "internal"
                  ? "bg-accent/20 border-accent/40"
                  : "bg-white/10 border-white/20"
              )}
            >
              {audioSource === "both" ? (
                <>
                  <Usb className="h-4 w-4 text-accent" />
                  <Mic className="h-3 w-3 text-accent -mt-0.5" />
                </>
              ) : audioSource === "external" ? (
                <>
                  <Usb className="h-5 w-5 text-accent" />
                  <span className="text-[7px] font-bold text-accent leading-none">USB</span>
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 text-white/60" />
                  <span className="text-[7px] font-bold text-white/40 leading-none">MIC</span>
                </>
              )}
            </button>
          )}

          {/* Spyn — music detection */}
          <SpynButton inline audioDeviceId={spynDeviceId} />
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
          allStreams.length > 1 ? "flex-col" : "flex-col aspect-[9/16]"
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
                onClick={() => startBroadcast({ video: true, audio: true })}
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
