"use client";

import { useRef, useEffect } from "react";
import { useState } from "react";
import { Video, VideoOff, Mic, MicOff, Camera, SwitchCamera } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useLiveBroadcast } from "@/features/live/hooks/useLiveBroadcast";
import PermissionDialog from "@/shared/ui/PermissionDialog";

interface CoHostPanelProps {
  code: string;
}

export default function CoHostPanel({ code }: CoHostPanelProps) {
  const {
    isBroadcasting,
    localStream,
    error,
    joinAsCoHost,
    leaveCoHost,
    switchCamera,
    facingMode,
    isMuted,
    toggleMute,
  } = useLiveBroadcast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useTranslations("live");
  const [showPermDialog, setShowPermDialog] = useState(false);

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

  // Fullscreen co-host when broadcasting
  if (isBroadcasting && localStream) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        {/* Fullscreen video */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
          playsInline
          muted
          autoPlay
        />

        {/* CO-HOST badge */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 safe-area-top">
          <span className="w-1.5 h-1.5 rounded-full bg-background animate-pulse" />
          <span className="text-[10px] font-bold text-background uppercase tracking-wider">CO-HOST</span>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-6 pb-10 flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center active:scale-95 transition-transform"
          >
            {isMuted ? (
              <MicOff className="h-6 w-6 text-red-400" />
            ) : (
              <Mic className="h-6 w-6 text-white" />
            )}
          </button>

          {/* Leave */}
          <button
            onClick={leaveCoHost}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center active:scale-95 transition-transform"
          >
            <VideoOff className="h-7 w-7 text-white" />
          </button>

          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center active:scale-95 transition-transform"
          >
            <SwitchCamera className="h-6 w-6 text-white" />
          </button>
        </div>

        {error && (
          <div className="absolute top-16 left-4 right-4 z-10">
            <p className="text-xs text-red-400 rounded-lg bg-red-500/20 backdrop-blur-sm border border-red-500/30 px-3 py-2">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Pre-join screen
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Camera className="h-10 w-10 text-accent mx-auto" />
          <h1 className="text-2xl font-bold text-primary">{t("coHostTitle")}</h1>
          <p className="text-sm text-foreground/50">{t("coHostDescription")}</p>
        </div>

        {error && (
          <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
        )}

        {!code && (
          <p className="text-xs text-red-400 text-center">{t("coHostNoCode")}</p>
        )}

        <button
          onClick={() => setShowPermDialog(true)}
          disabled={!code}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold transition-all",
            "bg-accent text-background hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
          )}
        >
          <Video className="h-5 w-5" />
          {t("coHostJoin")}
        </button>
      </div>

      <PermissionDialog
        type="camera+microphone"
        open={showPermDialog}
        onAllow={() => {
          setShowPermDialog(false);
          joinAsCoHost({ video: true, audio: true, coHostCode: code });
        }}
        onDeny={() => setShowPermDialog(false)}
      />
    </div>
  );
}
