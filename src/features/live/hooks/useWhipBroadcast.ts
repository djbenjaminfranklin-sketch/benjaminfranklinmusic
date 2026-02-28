"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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

  /**
   * Start broadcasting to a WHIP endpoint.
   * Performs the WHIP handshake: send SDP offer via POST, receive SDP answer.
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

      // Hint video track for motion content
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "contentHint" in videoTrack) {
        videoTrack.contentHint = "motion";
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;

      // Add tracks to the peer connection
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

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (or timeout)
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

      // Send the offer to the WHIP endpoint
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

      setIsBroadcasting(true);
    } catch (err) {
      // Cleanup on failure
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLocalStream(null);
      pcRef.current?.close();
      pcRef.current = null;
      setError(err instanceof Error ? err.message : "Unable to start broadcast");
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

      // Keep mute state
      const oldAudioTrack = streamRef.current.getAudioTracks()[0];
      if (oldAudioTrack && newAudioTrack) {
        newAudioTrack.enabled = oldAudioTrack.enabled;
      }

      // Replace tracks in the peer connection
      for (const sender of pcRef.current.getSenders()) {
        if (sender.track?.kind === "video" && newVideoTrack) {
          await sender.replaceTrack(newVideoTrack);
        }
        if (sender.track?.kind === "audio" && newAudioTrack) {
          await sender.replaceTrack(newAudioTrack);
        }
      }

      // Stop old tracks
      streamRef.current.getTracks().forEach((t) => t.stop());

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
  };
}
