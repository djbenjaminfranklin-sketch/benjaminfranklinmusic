"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
  bundlePolicy: "max-bundle",
};

// Fetch dynamic TURN credentials from our API (Metered.ca)
let cachedIceConfig: RTCConfiguration | null = null;
let cacheTime = 0;
async function getIceServers(): Promise<RTCConfiguration> {
  if (cachedIceConfig && Date.now() - cacheTime < 30 * 60 * 1000) {
    return cachedIceConfig;
  }
  try {
    const res = await fetch("/api/live/turn");
    if (res.ok) {
      const servers = await res.json();
      const hasCloudflareStun = servers.some((s: { urls: string | string[] }) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u: string) => u.includes("cloudflare"));
      });
      if (!hasCloudflareStun) {
        servers.push({ urls: "stun:stun.cloudflare.com:3478" });
      }
      cachedIceConfig = {
        iceServers: servers,
        bundlePolicy: "max-bundle",
      };
      cacheTime = Date.now();
      return cachedIceConfig;
    }
  } catch {}
  return DEFAULT_ICE;
}

// Screen Wake Lock — keeps screen on during broadcast (prevents iOS from suspending WebRTC)
async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) {
      const lock = await navigator.wakeLock.request("screen");
      console.log("[WHIP] Wake Lock acquired — screen will stay on");
      return lock;
    }
  } catch (e) {
    console.warn("[WHIP] Wake Lock failed:", e);
  }
  return null;
}

/**
 * Hook for broadcasting via WHIP (WebRTC HTTP Ingest Protocol).
 * Sends a single stream to Cloudflare Stream — no P2P fan-out.
 */
export function useWhipBroadcast() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMuted, setIsMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mixedAudioCtxRef = useRef<AudioContext | null>(null);
  const externalStreamRef = useRef<MediaStream | null>(null);
  const originalMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const whipUrlRef = useRef<string | null>(null);
  const reconnectingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");

  // Keep facingModeRef in sync
  facingModeRef.current = facingMode;

  /**
   * Re-acquire camera+mic if tracks are dead (e.g. after iOS background).
   */
  const ensureLiveTracks = useCallback(async (): Promise<MediaStream> => {
    const stream = streamRef.current;
    const videoTrack = stream?.getVideoTracks()[0];
    const audioTrack = stream?.getAudioTracks()[0];

    // If tracks are alive, reuse them
    if (stream && videoTrack?.readyState === "live" && audioTrack?.readyState === "live") {
      return stream;
    }

    console.log("[WHIP] Tracks dead — re-acquiring camera...");
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingModeRef.current, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });

    // Stop old dead tracks
    stream?.getTracks().forEach((t) => { if (t.readyState === "ended") t.stop(); });

    streamRef.current = newStream;
    setLocalStream(newStream);
    originalMicTrackRef.current = newStream.getAudioTracks()[0] || null;
    return newStream;
  }, []);

  /**
   * Start broadcasting to a WHIP endpoint.
   */
  const startBroadcast = useCallback(async (whipUrl: string) => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      streamRef.current = stream;
      setLocalStream(stream);

      originalMicTrackRef.current = stream.getAudioTracks()[0] || null;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "contentHint" in videoTrack) {
        videoTrack.contentHint = "motion";
      }

      const iceConfig = await getIceServers();
      const pc = new RTCPeerConnection(iceConfig);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Set low-latency encoding
      pc.addEventListener("negotiationneeded", async () => {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind !== "video") continue;
          try {
            const params = sender.getParameters();
            if (!params.encodings?.length) continue;
            params.degradationPreference = "maintain-framerate";
            params.encodings[0].maxBitrate = 2_000_000;
            params.encodings[0].maxFramerate = 30;
            await sender.setParameters(params);
          } catch {}
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const timeout = setTimeout(resolve, 3000);
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      whipUrlRef.current = whipUrl;

      const res = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
      });

      if (!res.ok) {
        throw new Error(`WHIP handshake failed (${res.status})`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp })
      );

      // Monitor WHIP connection state + auto-reconnect
      pc.onconnectionstatechange = () => {
        console.log("[WHIP] Connection state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setError(null);
          reconnectingRef.current = false;
        } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          console.warn("[WHIP] Connection lost, will auto-reconnect...");
          setError("Reconnexion en cours...");
          reconnectWhip();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[WHIP] ICE state:", pc.iceConnectionState);
      };

      // Acquire Wake Lock to keep screen on (prevents iOS from killing WebRTC)
      wakeLockRef.current = await acquireWakeLock();

      setIsBroadcasting(true);
      console.log("[WHIP] Broadcast started — handshake OK, waiting for connection...");
      return true;
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLocalStream(null);
      pcRef.current?.close();
      pcRef.current = null;
      setError(err instanceof Error ? err.message : "Unable to start broadcast");
      return false;
    }
  }, []);

  /**
   * Stop the broadcast.
   */
  const stopBroadcast = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);

    if (mixedAudioCtxRef.current) {
      mixedAudioCtxRef.current.close().catch(() => {});
      mixedAudioCtxRef.current = null;
    }
    externalStreamRef.current?.getTracks().forEach((t) => t.stop());
    externalStreamRef.current = null;

    // Release Wake Lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    setIsBroadcasting(false);
    setIsMuted(false);
  }, []);

  /**
   * Switch between front and back camera.
   */
  const switchCamera = useCallback(async () => {
    if (!streamRef.current || !pcRef.current) return;
    const newFacing = facingMode === "user" ? "environment" : "user";

    try {
      const oldAudioTrack = streamRef.current.getAudioTracks()[0];
      const wasMuted = oldAudioTrack ? !oldAudioTrack.enabled : false;

      const oldVideoTrack = streamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) oldVideoTrack.stop();

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: newFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (newAudioTrack) {
        newAudioTrack.enabled = !wasMuted;
      }

      for (const sender of pcRef.current.getSenders()) {
        if (sender.track?.kind === "video" && newVideoTrack) {
          await sender.replaceTrack(newVideoTrack);
        }
        if (sender.track?.kind === "audio" && newAudioTrack) {
          await sender.replaceTrack(newAudioTrack);
        }
      }

      if (oldAudioTrack) oldAudioTrack.stop();

      streamRef.current = newStream;
      setLocalStream(newStream);
      setFacingMode(newFacing);
    } catch {
      setError("Unable to switch camera");
      setTimeout(() => setError(null), 3000);
    }
  }, [facingMode]);

  /**
   * Toggle mute on the audio track.
   */
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  /**
   * Replace the audio source on the WHIP peer connection.
   */
  const replaceAudioSource = useCallback(async (mode: "internal" | "external" | "both", extDevId?: string | null, intDevId?: string | null) => {
    if (!streamRef.current) return;

    try {
      if (mixedAudioCtxRef.current) {
        mixedAudioCtxRef.current.close().catch(() => {});
        mixedAudioCtxRef.current = null;
      }
      externalStreamRef.current?.getTracks().forEach((t) => t.stop());
      externalStreamRef.current = null;

      const oldAudioTrack = streamRef.current.getAudioTracks()[0];
      const wasMuted = oldAudioTrack ? !oldAudioTrack.enabled : false;

      if (mode === "internal") {
        const micTrack = originalMicTrackRef.current;
        if (micTrack && oldAudioTrack !== micTrack) {
          if (wasMuted) micTrack.enabled = false;
          else micTrack.enabled = true;

          if (pcRef.current && pcRef.current.connectionState !== "closed") {
            for (const sender of pcRef.current.getSenders()) {
              if (sender.track?.kind === "audio") {
                await sender.replaceTrack(micTrack);
              }
            }
          }
          if (oldAudioTrack) streamRef.current.removeTrack(oldAudioTrack);
          if (!streamRef.current.getAudioTracks().includes(micTrack)) {
            streamRef.current.addTrack(micTrack);
          }
        }
        return;
      }

      let newAudioTrack: MediaStreamTrack;

      if (mode === "external" && extDevId) {
        const mixerStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: extDevId } },
        });
        externalStreamRef.current = mixerStream;
        newAudioTrack = mixerStream.getAudioTracks()[0];

      } else if (mode === "both" && extDevId) {
        const mixerStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: extDevId } },
        });
        externalStreamRef.current = mixerStream;

        const existingMicTrack = streamRef.current.getAudioTracks()[0];

        const audioCtx = new AudioContext();
        mixedAudioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();

        const mixerSource = audioCtx.createMediaStreamSource(mixerStream);
        const mixerGain = audioCtx.createGain();
        mixerGain.gain.value = 1.0;
        mixerSource.connect(mixerGain).connect(dest);

        if (existingMicTrack) {
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([existingMicTrack]));
          const micGain = audioCtx.createGain();
          micGain.gain.value = 0.8;
          micSource.connect(micGain).connect(dest);
        }

        newAudioTrack = dest.stream.getAudioTracks()[0];
      } else {
        return;
      }

      if (wasMuted) newAudioTrack.enabled = false;

      if (pcRef.current && pcRef.current.connectionState !== "closed") {
        for (const sender of pcRef.current.getSenders()) {
          if (sender.track?.kind === "audio") {
            await sender.replaceTrack(newAudioTrack);
          }
        }
      }

      if (oldAudioTrack && oldAudioTrack !== newAudioTrack) {
        streamRef.current.removeTrack(oldAudioTrack);
      }
      if (!streamRef.current.getAudioTracks().includes(newAudioTrack)) {
        streamRef.current.addTrack(newAudioTrack);
      }
    } catch (err) {
      console.error("[WHIP Audio] Failed to switch audio source:", err);
    }
  }, []);

  /**
   * Auto-reconnect WHIP when the connection drops.
   * Re-acquires camera if tracks are dead (iOS background kills them).
   */
  const reconnectWhip = useCallback(async () => {
    const whipUrl = whipUrlRef.current;
    if (!whipUrl || reconnectingRef.current) return;

    reconnectingRef.current = true;
    console.log("[WHIP] Auto-reconnecting...");

    pcRef.current?.close();
    pcRef.current = null;

    try {
      // Re-acquire media if tracks died (iOS background)
      const stream = await ensureLiveTracks();

      const iceConfig = await getIceServers();
      const pc = new RTCPeerConnection(iceConfig);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const timeout = setTimeout(resolve, 3000);
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      const res = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
      });

      if (!res.ok) throw new Error(`WHIP reconnect failed (${res.status})`);

      const answerSdp = await res.text();
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp })
      );

      pc.onconnectionstatechange = () => {
        console.log("[WHIP] Reconnect state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setError(null);
          reconnectingRef.current = false;
        } else if (pc.connectionState === "failed") {
          reconnectingRef.current = false;
          setTimeout(reconnectWhip, 3000);
        }
      };

      // Re-acquire Wake Lock (iOS releases it on background)
      if (!wakeLockRef.current || wakeLockRef.current.released) {
        wakeLockRef.current = await acquireWakeLock();
      }

      console.log("[WHIP] Reconnect handshake OK");
    } catch (err) {
      console.error("[WHIP] Reconnect failed:", err);
      reconnectingRef.current = false;
      setTimeout(reconnectWhip, 3000);
    }
  }, [ensureLiveTracks]);

  // Auto-reconnect when app returns to foreground (iOS/Android)
  useEffect(() => {
    if (!isBroadcasting) return;

    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        console.log("[WHIP] App returned to foreground");

        // Re-acquire Wake Lock (released when app went to background)
        if (!wakeLockRef.current || wakeLockRef.current.released) {
          wakeLockRef.current = await acquireWakeLock();
        }

        // Check connection state and reconnect if needed
        const pc = pcRef.current;
        if (!pc || pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
          reconnectWhip();
        } else {
          // Connection might look OK but tracks could be dead
          const videoTrack = streamRef.current?.getVideoTracks()[0];
          if (videoTrack?.readyState === "ended") {
            console.warn("[WHIP] Video track dead despite connection OK — reconnecting...");
            reconnectWhip();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isBroadcasting, reconnectWhip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  // Stop broadcast on page close
  useEffect(() => {
    if (!isBroadcasting) return;
    const handleUnload = () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [isBroadcasting]);

  return {
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
  };
}
