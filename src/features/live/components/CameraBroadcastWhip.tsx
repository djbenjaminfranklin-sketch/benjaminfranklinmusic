"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Video, VideoOff, Eye, Mic, MicOff, SwitchCamera, MapPin, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useWhipBroadcast } from "@/features/live/hooks/useWhipBroadcast";
import PermissionDialog from "@/shared/ui/PermissionDialog";

interface CameraBroadcastWhipProps {
  venue?: string;
  viewerCount?: number;
}

/**
 * Simplified broadcaster component that uses WHIP → Cloudflare Stream.
 * No co-hosts, no P2P fan-out — just a single stream to the CDN.
 */
export default function CameraBroadcastWhip({ venue, viewerCount = 0 }: CameraBroadcastWhipProps) {
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
  } = useWhipBroadcast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("admin");
  const tLive = useTranslations("live");

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Permission dialog for camera+mic
  const [showPermDialog, setShowPermDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [starting, setStarting] = useState(false);
  const [whipError, setWhipError] = useState<string | null>(null);

  const requestPermissionThen = (action: () => void) => {
    setPendingAction(() => action);
    setShowPermDialog(true);
  };

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

  // Display fullscreen preview
  useEffect(() => {
    const video = fullscreenVideoRef.current;
    if (!video) return;
    if (localStream && isFullscreen) {
      video.srcObject = localStream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [localStream, isFullscreen]);

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

  /**
   * Full go-live flow:
   * 1. Create Cloudflare Live Input → get whipUrl + hlsUrl
   * 2. Start WHIP broadcast to whipUrl
   * 3. Go live with hlsUrl → push notifications
   */
  const handleGoLive = useCallback(async () => {
    setStarting(true);
    setWhipError(null);

    try {
      // Step 1: Create stream
      const createRes = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-stream" }),
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create stream");
      }

      const { whipUrl, hlsUrl } = await createRes.json();

      // Step 2: Start WHIP broadcast
      await startBroadcast(whipUrl);

      // Step 3: Go live (sets status + sends push notifications)
      const geoResult = await detectVenue();
      const goLiveRes = await fetch("/api/live/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "go-live",
          streamUrl: hlsUrl,
          streamType: "hls",
          venue: geoResult.venue || venue,
          lat: geoResult.lat,
          lng: geoResult.lng,
        }),
      });

      if (!goLiveRes.ok) {
        throw new Error("Failed to go live");
      }
    } catch (err) {
      setWhipError(err instanceof Error ? err.message : "Error starting stream");
      // Stop broadcast if it was started
      stopBroadcast();
    } finally {
      setStarting(false);
    }
  }, [startBroadcast, stopBroadcast, detectVenue, venue]);

  /**
   * Stop the live: stop broadcast + stop-live API.
   */
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

  const displayError = whipError || error;

  // Fullscreen mode
  if (isBroadcasting && localStream && isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden touch-none">
        <video
          ref={fullscreenVideoRef}
          className="w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
          playsInline
          muted
          autoPlay
        />

        {/* Top overlays */}
        <div className="absolute top-0 left-0 right-0 z-40 p-4 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1rem))] flex items-start justify-between">
          {/* Left: LIVE badge + venue */}
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
          </div>

          {/* Right: viewers + minimize */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-2 border border-white/10 min-h-[40px]">
              <Eye className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold text-white tabular-nums">{viewerCount}</span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            >
              <Minimize2 className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-40 p-4 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))] flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-all touch-manipulation border",
              isMuted
                ? "bg-red-500/20 border-red-500/30"
                : "bg-black/60 backdrop-blur-sm border-white/10"
            )}
          >
            {isMuted ? <MicOff className="h-5 w-5 text-red-400" /> : <Mic className="h-5 w-5 text-white" />}
          </button>
          <button
            onClick={switchCamera}
            className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
          >
            <SwitchCamera className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={handleStopLive}
            className="flex items-center gap-2 rounded-full bg-foreground/10 border border-border px-6 py-3 text-sm font-semibold text-foreground/60 active:scale-95 transition-all touch-manipulation"
          >
            <VideoOff className="h-4 w-4" />
            {t("stopLiveCamera")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Video preview */}
      {isBroadcasting && localStream ? (
        <div
          className="relative rounded-xl overflow-hidden border border-border bg-black max-h-[65vh] mx-auto aspect-[9/16] cursor-pointer"
          onClick={() => setIsFullscreen(true)}
        >
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
          {venue && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-white/10">
              <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="text-xs font-medium text-white truncate max-w-[200px]">{venue}</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); switchCamera(); }}
            className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
          >
            <SwitchCamera className="h-5 w-5 text-white" />
          </button>
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
          <div className="flex gap-3 w-full">
            {/* Mute */}
            <button
              onClick={toggleMute}
              className={cn(
                "rounded-xl px-4 py-3 text-sm font-medium border transition-colors",
                isMuted
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : "bg-foreground/5 border-border text-foreground/60 hover:bg-foreground/10"
              )}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            {/* Stop */}
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
          </div>
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
