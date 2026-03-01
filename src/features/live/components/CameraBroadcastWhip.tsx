"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Video, VideoOff, Eye, Mic, MicOff, SwitchCamera, Minimize2, LayoutGrid, Shuffle, MapPin, Music, Usb, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useWhipBroadcast } from "@/features/live/hooks/useWhipBroadcast";
import LiveChatOverlay from "@/features/live/components/LiveChatOverlay";
import SpynButton from "@/features/live/components/SpynButton";
import PermissionDialog from "@/shared/ui/PermissionDialog";
import { useAudioDevices } from "@/features/live/hooks/useAudioDevices";
import type { LiveChatMessage } from "@/shared/types";

interface CameraBroadcastWhipProps {
  venue?: string;
  viewerCount?: number;
  externalCoHostStreams?: Map<string, MediaStream>;
  chatMessages?: LiveChatMessage[];
  onSendChat?: (author: string, content: string, djPassword?: string) => Promise<void>;
  currentTrack?: { artist: string; title: string } | null;
  onInviteViewer?: () => Promise<void>;
  inviting?: boolean;
  onDisconnectGuest?: (guestId: string) => void;
  isServerLive?: boolean;
  sseClientId?: string | null;
}

function StreamBand({ stream, label, mirror }: { stream: MediaStream; label: string; mirror?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
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

function GuestThumb({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Full-featured broadcaster component using WHIP → Cloudflare Stream.
 * Same UI as CameraBroadcast (fullscreen, recording, chat, audio, SPYN)
 * but streams via WHIP to Cloudflare CDN instead of WebRTC P2P.
 */
export default function CameraBroadcastWhip({ venue, viewerCount = 0, externalCoHostStreams, chatMessages, onSendChat, currentTrack, onInviteViewer, inviting, onDisconnectGuest, isServerLive, sseClientId }: CameraBroadcastWhipProps) {
  const {
    isBroadcasting,
    localStream,
    error,
    facingMode,
    isMuted,
    startBroadcast,
    stopBroadcast,
    switchCamera,
    toggleMute,
    replaceAudioSource,
  } = useWhipBroadcast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");

  // Permission dialog for camera+mic
  const [showPermDialog, setShowPermDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [starting, setStarting] = useState(false);
  const [whipError, setWhipError] = useState<string | null>(null);

  const requestPermissionThen = (action: () => void) => {
    setPendingAction(() => action);
    setShowPermDialog(true);
  };

  // Audio device detection (Pioneer mixer, USB interfaces, etc.)
  const { audioSource, audioSourceName, externalDeviceId, internalDeviceId, nativeAudio, setAudioSource, toggleNativeMic } = useAudioDevices();
  const hasExternalDevice = !!externalDeviceId || !!nativeAudio?.isUSB;
  const spynDeviceId = audioSource === "external" || audioSource === "both" ? externalDeviceId : internalDeviceId;

  // Auto-resume broadcast after iOS kills and reloads the tab
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (isBroadcasting || !isServerLive || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    try {
      const saved = sessionStorage.getItem("whip_session");
      if (!saved) return;
      const { whipUrl, ts } = JSON.parse(saved);
      // Only resume if the session is less than 2 hours old
      if (Date.now() - ts > 2 * 60 * 60 * 1000) {
        sessionStorage.removeItem("whip_session");
        return;
      }
      console.log("[WHIP] Auto-resuming broadcast after tab reload...");
      startBroadcast(whipUrl);
    } catch {}
  }, [isServerLive, isBroadcasting, startBroadcast]);

  // Auto-switch broadcast audio when user changes source
  const prevAudioSourceRef = useRef(audioSource);
  useEffect(() => {
    const prev = prevAudioSourceRef.current;
    prevAudioSourceRef.current = audioSource;
    if (prev !== audioSource && isBroadcasting) {
      replaceAudioSource(audioSource, externalDeviceId, internalDeviceId);
    }
  }, [audioSource, externalDeviceId, internalDeviceId, isBroadcasting, replaceAudioSource]);

  // --- Fullscreen mode ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-fullscreen when broadcast starts
  useEffect(() => {
    if (isBroadcasting && localStream) {
      setIsFullscreen(true);
    }
  }, [isBroadcasting, localStream]);

  // --- Broadcast mode: multicam or director ---
  const [broadcastMode, setBroadcastMode] = useState<"multicam" | "director">("director");

  // --- Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);

  // Display local preview
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

  // Auto-detect venue from GPS
  const detectVenue = useCallback(async (): Promise<{ venue?: string; lat?: number; lng?: number }> => {
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          enableHighAccuracy: true, timeout: 8000, maximumAge: 0,
        });
      });
      if (!pos) return {};
      const { latitude: lat, longitude: lng } = pos.coords;
      const res = await fetch(`/api/admin/places/nearby?lat=${lat}&lng=${lng}`);
      if (!res.ok) return { lat, lng };
      const data = await res.json();
      return { venue: data.places?.[0]?.name, lat, lng };
    } catch {
      return {};
    }
  }, []);

  // Merge external co-host streams
  const coHostEntries = externalCoHostStreams ? Array.from(externalCoHostStreams.entries()) : [];

  // Which stream is shown as main view (null = local camera, guestId = that guest's camera)
  const [focusedGuestId, setFocusedGuestId] = useState<string | null>(null);

  // Reset focus if the focused guest disconnects
  useEffect(() => {
    if (focusedGuestId && !externalCoHostStreams?.has(focusedGuestId)) {
      setFocusedGuestId(null);
    }
  }, [focusedGuestId, externalCoHostStreams]);

  // Build list of all available streams
  const allStreams = [
    ...(localStream ? [{ id: "local", stream: localStream, label: tLive("angleMain"), mirror: facingMode === "user" }] : []),
    ...coHostEntries.map(([id], i) => ({
      id,
      stream: externalCoHostStreams!.get(id)!,
      label: tLive("angleNumber", { n: i + 2 }),
      mirror: false,
    })),
  ];
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);

  // Auto-switch every 6 seconds (director mode)
  useEffect(() => {
    if (allStreams.length <= 1 || broadcastMode !== "director") return;
    const interval = setInterval(() => {
      setActiveStreamIndex((prev) => (prev + 1) % allStreams.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [allStreams.length, broadcastMode]);

  const safeIndex = allStreams.length > 0 ? activeStreamIndex % allStreams.length : 0;
  const currentDirectorStream = allStreams[safeIndex];

  // Refs for recording render loop
  const allStreamsRef = useRef(allStreams);
  allStreamsRef.current = allStreams;
  const broadcastModeRef = useRef(broadcastMode);
  broadcastModeRef.current = broadcastMode;
  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;

  // --- Recording logic (same as CameraBroadcast) ---
  const startRecording = useCallback(() => {
    if (!localStream) return;
    recordedChunksRef.current = [];
    setRecordingTime(0);

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    recordingCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;

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

    const render = () => {
      const streams = allStreamsRef.current;
      const mode = broadcastModeRef.current;
      const idx = safeIndexRef.current;

      for (const s of streams) {
        if (!videos.has(s.id)) {
          videos.set(s.id, createVideo(s.stream));
        }
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (mode === "multicam") {
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

    const canvasStream = canvas.captureStream(30);

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

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

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
      if (saved) return;
      saved = true;
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];

      combinedStreamRef.current?.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
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

      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mimeType || "video/mp4" });
      if (blob.size < 10000) return;
      const filename = `live-${new Date().toISOString().slice(0, 19)}.${ext}`;
      const file = new File([blob], filename, { type: mimeType || "video/mp4" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file] }).catch(() => {});
      }
    };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    combinedStreamRef.current = combinedStream;
    setIsRecording(true);

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

  // No client-side auto-stop — on mobile, there's no reliable way to distinguish
  // "switching to WhatsApp" from "killing the app" in JavaScript.
  // When the app is force-killed, the WHIP connection drops naturally and
  // Cloudflare stops receiving media. The admin can stop the live manually.

  // --- Go Live (Cloudflare WHIP flow) ---
  const handleGoLive = useCallback(async () => {
    setStarting(true);
    setWhipError(null);

    try {
      const createRes = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-stream" }),
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create stream");
      }

      const { whipUrl, whepUrl } = await createRes.json();

      const success = await startBroadcast(whipUrl);
      if (!success) return;

      const geoResult = await detectVenue();
      const goLiveRes = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "go-live",
          streamUrl: whepUrl,
          streamType: "whep",
          venue: geoResult.venue || venue,
          lat: geoResult.lat,
          lng: geoResult.lng,
          broadcasterId: sseClientId,
        }),
      });

      if (!goLiveRes.ok) {
        throw new Error("Failed to go live");
      }
    } catch (err) {
      setWhipError(err instanceof Error ? err.message : "Error starting stream");
      stopBroadcast();
    } finally {
      setStarting(false);
    }
  }, [startBroadcast, stopBroadcast, detectVenue, venue, sseClientId]);

  // --- Stop Live ---
  const handleStopLive = useCallback(async () => {
    stopBroadcast();

    try {
      await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-live" }),
      });
    } catch {
      // Best effort
    }
  }, [stopBroadcast]);

  // Send stop-live beacon when the page unloads (app killed, tab closed, navigation)
  useEffect(() => {
    if (!isBroadcasting) return;

    const sendStopBeacon = () => {
      navigator.sendBeacon(
        "/api/live/admin",
        new Blob(
          [JSON.stringify({ action: "stop-live" })],
          { type: "application/json" }
        )
      );
    };

    // beforeunload: fires on tab close, navigation, page reload
    window.addEventListener("beforeunload", sendStopBeacon);

    // pagehide: more reliable on iOS Safari when app is killed
    window.addEventListener("pagehide", sendStopBeacon);

    return () => {
      window.removeEventListener("beforeunload", sendStopBeacon);
      window.removeEventListener("pagehide", sendStopBeacon);
    };
  }, [isBroadcasting]);

  const displayError = whipError || error;

  // ========================
  // FULLSCREEN BROADCASTING
  // ========================
  if (isBroadcasting && localStream && isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden touch-none">
        {/* Main view: depends on broadcastMode */}
        {focusedGuestId && externalCoHostStreams?.get(focusedGuestId) ? (
          /* User tapped a guest thumbnail — override any mode */
          <StreamBand stream={externalCoHostStreams.get(focusedGuestId)!} label={tLive("angleNumber", { n: coHostEntries.findIndex(([id]) => id === focusedGuestId) + 2 })} />
        ) : broadcastMode === "multicam" && allStreams.length > 1 ? (
          /* Multicam: grid of all cameras */
          <div className="absolute inset-0 grid gap-0.5 bg-black" style={{ gridTemplateColumns: allStreams.length > 2 ? "1fr 1fr" : "1fr", gridTemplateRows: `repeat(${Math.min(allStreams.length, 2)}, 1fr)` }}>
            {allStreams.slice(0, 4).map((s) => (
              <div key={s.id} className="relative overflow-hidden">
                <StreamBand stream={s.stream} label={s.label} mirror={s.mirror} />
                <div className="absolute bottom-2 left-2 z-10">
                  <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        ) : broadcastMode === "director" && allStreams.length > 1 ? (
          /* Director: all streams are always mounted, only the active one is visible */
          <div className="absolute inset-0">
            {allStreams.map((s, i) => (
              <div key={s.id} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: i === safeIndex ? 1 : 0, zIndex: i === safeIndex ? 1 : 0 }}>
                <StreamBand stream={s.stream} label={s.label} mirror={s.mirror} />
              </div>
            ))}
          </div>
        ) : localStream ? (
          <StreamBand stream={localStream} label={tLive("angleMain")} mirror={facingMode === "user"} />
        ) : null}

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

        {/* Top overlays */}
        <div className="absolute top-0 left-0 right-0 z-40 p-4 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1rem))] flex items-start justify-between">
          {/* Left: LIVE badge + venue + audio + track */}
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
            <button
              onClick={() => {
                const next = audioSource === "both" ? "external" : audioSource === "external" ? "internal" : "both";
                setAudioSource(next);
              }}
              className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-1.5 border border-white/10 w-fit active:scale-95 transition-transform touch-manipulation"
            >
              {audioSource === "both" ? (
                <>
                  <Usb className="h-3 w-3 shrink-0 text-accent" />
                  <Mic className="h-2.5 w-2.5 shrink-0 text-accent -ml-1" />
                  <span className="text-[10px] font-bold text-accent">USB+MIC</span>
                </>
              ) : audioSource === "external" ? (
                <>
                  <Usb className="h-3 w-3 shrink-0 text-accent" />
                  <span className="text-[10px] font-bold text-accent">USB</span>
                </>
              ) : (
                <>
                  <Mic className="h-3 w-3 shrink-0 text-white/60" />
                  <span className="text-[10px] font-bold text-white/60">MIC</span>
                </>
              )}
            </button>
            {currentTrack && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10 w-fit">
                <Music className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-xs font-medium text-white truncate max-w-[200px]">{currentTrack.artist} — {currentTrack.title}</span>
              </div>
            )}
          </div>

          {/* Right: record + mode toggle + viewers + minimize */}
          <div className="flex items-center gap-2">
            {/* Record button */}
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
            {/* Multicam / Director toggle */}
            <div className={cn(
              "flex items-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 p-1",
              allStreams.length <= 1 && "opacity-40"
            )}>
              <button
                onClick={() => { if (allStreams.length > 1) { setBroadcastMode("multicam"); setFocusedGuestId(null); } }}
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
                onClick={() => { if (allStreams.length > 1) { setBroadcastMode("director"); setFocusedGuestId(null); } }}
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

        {/* Thumbnails: tap to swap with main view */}
        {(coHostEntries.length > 0 || focusedGuestId) && (
          <div className="absolute bottom-32 left-4 z-30 flex gap-2">
            {/* If a guest is focused, show local camera as first thumbnail */}
            {focusedGuestId && localStream && (
              <button
                onClick={() => setFocusedGuestId(null)}
                className="relative"
              >
                <div className="w-20 h-28 rounded-xl overflow-hidden border-2 border-white/50 bg-black shadow-lg">
                  <GuestThumb stream={localStream} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-1 py-0.5 rounded-b-xl">
                  <p className="text-[8px] font-bold text-white text-center truncate">{tLive("angleMain")}</p>
                </div>
              </button>
            )}
            {/* Guest thumbnails (skip the one that's currently focused) */}
            {coHostEntries.map(([id], i) => {
              if (id === focusedGuestId) return null;
              const guestStream = externalCoHostStreams!.get(id);
              return (
                <div key={id} className="relative">
                  <button onClick={() => setFocusedGuestId(id)}>
                    <div className="w-20 h-28 rounded-xl overflow-hidden border-2 border-accent/50 bg-black shadow-lg">
                      {guestStream && <GuestThumb stream={guestStream} />}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-1 py-0.5 rounded-b-xl">
                      <p className="text-[8px] font-bold text-white text-center truncate">{"\u2B50"} {tLive("angleNumber", { n: i + 2 })}</p>
                    </div>
                  </button>
                  {onDisconnectGuest && (
                    <button
                      onClick={() => onDisconnectGuest(id)}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 border-2 border-black flex items-center justify-center z-10 active:scale-90 transition-transform touch-manipulation"
                    >
                      <span className="text-white text-xs font-bold leading-none">&times;</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Chat overlay */}
        {chatMessages && onSendChat && (
          <div className="absolute inset-0 bottom-28 z-20 pointer-events-none">
            <div className="relative w-full h-full pointer-events-auto">
              <LiveChatOverlay messages={chatMessages} onSend={onSendChat} />
            </div>
          </div>
        )}

        {/* Bottom controls */}
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
            onClick={handleStopLive}
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
          {onInviteViewer && (
            <button
              onClick={onInviteViewer}
              disabled={inviting}
              className="w-14 h-14 rounded-full bg-accent/20 backdrop-blur-sm border border-accent/30 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 touch-manipulation"
            >
              <UserPlus className="h-6 w-6 text-accent" />
            </button>
          )}

          {/* Native mic toggle (iOS app with USB connected) */}
          {nativeAudio?.isUSB && (
            <button
              onClick={() => toggleNativeMic(!nativeAudio.isMicEnabled)}
              className={cn(
                "w-14 h-14 rounded-full backdrop-blur-sm border flex flex-col items-center justify-center active:scale-95 transition-transform touch-manipulation gap-0.5",
                nativeAudio.isMicEnabled
                  ? "bg-green-500/20 border-green-500/40"
                  : "bg-white/10 border-white/20"
              )}
            >
              {nativeAudio.isMicEnabled ? (
                <>
                  <Mic className="h-5 w-5 text-green-400" />
                  <span className="text-[7px] font-bold text-green-400 leading-none">MIC</span>
                </>
              ) : (
                <>
                  <MicOff className="h-5 w-5 text-white/40" />
                  <span className="text-[7px] font-bold text-white/40 leading-none">MIC</span>
                </>
              )}
            </button>
          )}

          {/* Spyn — music detection */}
          <SpynButton inline audioDeviceId={spynDeviceId} audioStream={localStream} />
        </div>

        {displayError && (
          <div className="absolute top-32 left-4 right-4 z-50">
            <p className="text-xs text-red-400 rounded-lg bg-red-500/20 backdrop-blur-sm border border-red-500/30 px-3 py-2">{displayError}</p>
          </div>
        )}
      </div>
    );
  }

  // ========================
  // INLINE VIEW (not fullscreen)
  // ========================
  return (
    <div className="space-y-4 overflow-hidden">
      {/* Video preview */}
      {isBroadcasting && localStream ? (
        <div className="relative rounded-xl overflow-hidden border border-border bg-black max-h-[65vh] mx-auto flex flex-col aspect-[9/16] cursor-pointer"
          onClick={() => setIsFullscreen(true)}>
          {/* Main view: depends on broadcastMode */}
          {focusedGuestId && externalCoHostStreams?.get(focusedGuestId) ? (
            <StreamBand stream={externalCoHostStreams.get(focusedGuestId)!} label={tLive("angleNumber", { n: coHostEntries.findIndex(([id]) => id === focusedGuestId) + 2 })} />
          ) : broadcastMode === "multicam" && allStreams.length > 1 ? (
            <div className="absolute inset-0 grid gap-0.5 bg-black" style={{ gridTemplateColumns: allStreams.length > 2 ? "1fr 1fr" : "1fr", gridTemplateRows: `repeat(${Math.min(allStreams.length, 2)}, 1fr)` }}>
              {allStreams.slice(0, 4).map((s) => (
                <div key={s.id} className="relative overflow-hidden">
                  <StreamBand stream={s.stream} label={s.label} mirror={s.mirror} />
                  <div className="absolute bottom-2 left-2 z-10">
                    <span className="text-[9px] font-bold text-white/70 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : broadcastMode === "director" && allStreams.length > 1 ? (
            <div className="absolute inset-0">
              {allStreams.map((s, i) => (
                <div key={s.id} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: i === safeIndex ? 1 : 0, zIndex: i === safeIndex ? 1 : 0 }}>
                  <StreamBand stream={s.stream} label={s.label} mirror={s.mirror} />
                </div>
              ))}
            </div>
          ) : (
            <StreamBand stream={localStream} label={tLive("angleMain")} mirror={facingMode === "user"} />
          )}
          {/* Thumbnails (inline view) — tap to swap */}
          {(coHostEntries.length > 0 || focusedGuestId) && (
            <div className="absolute bottom-14 left-2 z-10 flex gap-1.5">
              {/* If a guest is focused, show local as thumbnail */}
              {focusedGuestId && localStream && (
                <button onClick={(e) => { e.stopPropagation(); setFocusedGuestId(null); }} className="relative">
                  <div className="w-16 h-22 rounded-lg overflow-hidden border-2 border-white/50 bg-black shadow-lg">
                    <GuestThumb stream={localStream} />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 rounded-b-lg">
                    <p className="text-[7px] font-bold text-white text-center truncate">{tLive("angleMain")}</p>
                  </div>
                </button>
              )}
              {/* Guest thumbnails (skip focused one) */}
              {coHostEntries.map(([id], i) => {
                if (id === focusedGuestId) return null;
                const guestStream = externalCoHostStreams!.get(id);
                return (
                  <div key={id} className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setFocusedGuestId(id); }}>
                      <div className="w-16 h-22 rounded-lg overflow-hidden border-2 border-accent/50 bg-black shadow-lg">
                        {guestStream && <GuestThumb stream={guestStream} />}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 rounded-b-lg">
                        <p className="text-[7px] font-bold text-white text-center truncate">{tLive("angleNumber", { n: i + 2 })}</p>
                      </div>
                    </button>
                    {onDisconnectGuest && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDisconnectGuest(id); }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-black flex items-center justify-center z-10 active:scale-90 touch-manipulation"
                      >
                        <span className="text-white text-[10px] font-bold leading-none">&times;</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

      {displayError && (
        <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{displayError}</p>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {!isBroadcasting ? (
          <button
            onClick={() => requestPermissionThen(handleGoLive)}
            disabled={starting}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
              "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
            )}
          >
            <Video className="h-4 w-4" />
            {starting ? tLive("connecting") : t("goLiveCamera")}
          </button>
        ) : (
          <>
            <button
              onClick={handleStopLive}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                "bg-foreground/10 border border-border text-foreground/60 hover:bg-foreground/15 active:scale-[0.98]"
              )}
            >
              <VideoOff className="h-4 w-4" />
              {t("stopLiveCamera")}
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

      <PermissionDialog
        type="camera+microphone"
        open={showPermDialog}
        onAllow={() => {
          setShowPermDialog(false);
          pendingAction?.();
          setPendingAction(null);
        }}
        onDeny={() => {
          setShowPermDialog(false);
          setPendingAction(null);
        }}
      />
    </div>
  );
}
