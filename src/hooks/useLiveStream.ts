"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { LiveChatMessage, LiveStreamStatus } from "@/types";

function getIceServers(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }
  return { iceServers: servers };
}

const ICE_SERVERS = getIceServers();

export interface ScheduledLiveData {
  date: string;
  venue: string;
  city: string;
}

interface LiveState {
  messages: LiveChatMessage[];
  viewerCount: number;
  status: LiveStreamStatus;
  clientId?: string;
  scheduledLive?: ScheduledLiveData | null;
}

export interface PendingInvite {
  inviteId: string;
}

export function useLiveStream() {
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamStatus, setStreamStatus] = useState<LiveStreamStatus>({
    isLive: false,
    streamUrl: null,
    streamType: null,
    currentTrack: null,
    startedAt: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [coHostStreams, setCoHostStreams] = useState<Map<string, MediaStream>>(new Map());
  const [activeAngle, setActiveAngle] = useState<string>("main");
  const [scheduledLive, setScheduledLive] = useState<ScheduledLiveData | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [guestStream, setGuestStream] = useState<MediaStream | null>(null);

  const retryRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const coHostPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const guestPcRef = useRef<RTCPeerConnection | null>(null);
  const guestStreamRef = useRef<MediaStream | null>(null);
  const mainBroadcasterRef = useRef<string | null>(null);
  // Ref to always dispatch to the latest handleSignal from the SSE listener
  const handleSignalRef = useRef<((signal: { type: string; from: string; data: unknown }) => Promise<void>) | undefined>(undefined);

  // Nettoyer la peer connection WebRTC
  const cleanupWebRTC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    coHostPcsRef.current.forEach((pc) => pc.close());
    coHostPcsRef.current.clear();
    mainBroadcasterRef.current = null;
    setRemoteStream(null);
    setCoHostStreams(new Map());
    setActiveAngle("main");
  }, []);

  // Demander à rejoindre le broadcast WebRTC
  const joinWebRTC = useCallback(() => {
    if (!clientIdRef.current) return;

    fetch("/api/live/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "viewer-join",
        from: clientIdRef.current,
      }),
    });
  }, []);

  // Gérer les signaux WebRTC entrants
  const handleSignal = useCallback(async (signal: { type: string; from: string; data: unknown }) => {
    const { type, from, data } = signal;

    if (type === "offer") {
      // If we have a guest stream ready and a main connection exists,
      // this offer from the broadcaster is for the guest peer connection
      if (guestStreamRef.current && from === mainBroadcasterRef.current && pcRef.current) {
        if (guestPcRef.current) {
          guestPcRef.current.close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        guestPcRef.current = pc;

        // Add our camera tracks so the broadcaster can receive them
        guestStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, guestStreamRef.current!);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate && clientIdRef.current) {
            fetch("/api/live/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ice-candidate", from: clientIdRef.current, to: from, data: event.candidate }),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            guestPcRef.current = null;
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", from: clientIdRef.current, to: from, data: answer }),
        });

        return;
      }

      const isMainBroadcaster = !mainBroadcasterRef.current || from === mainBroadcasterRef.current;
      const isNewMainBroadcaster = !mainBroadcasterRef.current && !pcRef.current;

      if (isNewMainBroadcaster || isMainBroadcaster) {
        // Main broadcaster offer
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        mainBroadcasterRef.current = from;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        pc.ontrack = (event) => {
          setRemoteStream(event.streams[0] || null);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && clientIdRef.current) {
            fetch("/api/live/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ice-candidate", from: clientIdRef.current, to: from, data: event.candidate }),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            if (pcRef.current === pc) {
              pcRef.current = null;
              setRemoteStream(null);
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", from: clientIdRef.current, to: from, data: answer }),
        });
      } else {
        // Co-host offer
        const existingPc = coHostPcsRef.current.get(from);
        if (existingPc) {
          existingPc.close();
          coHostPcsRef.current.delete(from);
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        coHostPcsRef.current.set(from, pc);

        pc.ontrack = (event) => {
          const stream = event.streams[0];
          if (stream) {
            setCoHostStreams((prev) => new Map(prev).set(from, stream));
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && clientIdRef.current) {
            fetch("/api/live/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ice-candidate", from: clientIdRef.current, to: from, data: event.candidate }),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            coHostPcsRef.current.delete(from);
            setCoHostStreams((prev) => {
              const next = new Map(prev);
              next.delete(from);
              return next;
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", from: clientIdRef.current, to: from, data: answer }),
        });
      }
    } else if (type === "ice-candidate") {
      // Check main broadcaster
      if (pcRef.current && from === mainBroadcasterRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit));
        } catch { /* ignore */ }
      }
      // Check guest peer (also from broadcaster)
      if (guestPcRef.current && from === mainBroadcasterRef.current) {
        try {
          await guestPcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit));
        } catch { /* ignore */ }
      }
      // Check co-host peers
      const coHostPc = coHostPcsRef.current.get(from);
      if (coHostPc) {
        try {
          await coHostPc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit));
        } catch { /* ignore */ }
      }
    }
  }, [cleanupWebRTC]);

  // Keep the ref in sync with the latest handleSignal
  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  // Accept invite — viewer starts sharing camera
  const acceptInvite = useCallback(async (inviteId: string, name?: string) => {
    if (!clientIdRef.current) return;
    setPendingInvite(null);

    // Respond to server
    await fetch("/api/live/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invite-response", from: clientIdRef.current, inviteId, accepted: true }),
    });

    // Open camera and send stream to broadcaster
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setGuestStream(stream);
      guestStreamRef.current = stream;

      if (streamStatus.streamType !== "webrtc") return;

      // Signal the broadcaster that we're ready with our stream
      // The broadcaster will create a new peer connection for this guest
      await fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "guest-ready", from: clientIdRef.current, data: { inviteId, name } }),
      });

      // We'll receive an offer from the broadcaster for the guest connection
      // This is handled in handleSignal
    } catch {
      setGuestStream(null);
      guestStreamRef.current = null;
    }
  }, [streamStatus.streamType]);

  const declineInvite = useCallback(async (inviteId: string) => {
    if (!clientIdRef.current) return;
    setPendingInvite(null);
    await fetch("/api/live/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invite-response", from: clientIdRef.current, inviteId, accepted: false }),
    });
  }, []);

  const stopGuest = useCallback(() => {
    guestStream?.getTracks().forEach((t) => t.stop());
    setGuestStream(null);
    guestStreamRef.current = null;
    if (guestPcRef.current) {
      guestPcRef.current.close();
      guestPcRef.current = null;
    }
  }, [guestStream]);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const es = new EventSource("/api/live/stream");
      esRef.current = es;

      es.addEventListener("init", (e) => {
        const data = JSON.parse(e.data) as LiveState;
        clientIdRef.current = data.clientId || null;
        setChatMessages(data.messages);
        setViewerCount(data.viewerCount);
        setStreamStatus(data.status);
        setScheduledLive(data.scheduledLive || null);
        setIsConnected(true);
        retryRef.current = 1000;

        // Si un live WebRTC est en cours, rejoindre
        if (data.status.isLive && data.status.streamType === "webrtc") {
          setTimeout(() => joinWebRTC(), 500);
        }
      });

      es.addEventListener("message", (e) => {
        const msg = JSON.parse(e.data) as LiveChatMessage;
        setChatMessages((prev) => {
          const next = [...prev, msg];
          return next.length > 50 ? next.slice(-50) : next;
        });
      });

      es.addEventListener("presence", (e) => {
        const { viewerCount: count } = JSON.parse(e.data);
        setViewerCount(count);
      });

      es.addEventListener("status", (e) => {
        const status = JSON.parse(e.data) as LiveStreamStatus;
        setStreamStatus(status);
        if (!status.isLive) {
          setChatMessages([]);
          cleanupWebRTC();
        } else {
          // Live started — clear scheduled live
          setScheduledLive(null);
          if (status.streamType === "webrtc") {
            // Nouveau live WebRTC, rejoindre
            setTimeout(() => joinWebRTC(), 500);
          }
        }
      });

      es.addEventListener("scheduled", (e) => {
        const data = JSON.parse(e.data);
        setScheduledLive(data || null);
      });

      es.addEventListener("track", (e) => {
        const track = JSON.parse(e.data);
        setStreamStatus((prev) => ({ ...prev, currentTrack: track }));
      });

      // Use ref-based dispatch so we always call the latest handleSignal
      // without needing to re-create the SSE connection
      es.addEventListener("signal", (e) => {
        const signal = JSON.parse(e.data);
        handleSignalRef.current?.(signal);
      });

      es.addEventListener("co-hosts", (e) => {
        const { coHostIds } = JSON.parse(e.data) as { coHostIds: string[] };
        // When new co-hosts join, re-send viewer-join so they create peer connections with us
        if (coHostIds.length > 0 && clientIdRef.current) {
          fetch("/api/live/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "viewer-join",
              from: clientIdRef.current,
            }),
          });
        }
      });

      es.addEventListener("invite", (e) => {
        const data = JSON.parse(e.data) as { inviteId: string; viewerId: string };
        setPendingInvite({ inviteId: data.inviteId });
      });

      es.onerror = () => {
        es.close();
        setIsConnected(false);
        cleanupWebRTC();
        if (!cancelled) {
          const delay = retryRef.current;
          retryRef.current = Math.min(delay * 2, 30000);
          setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      cleanupWebRTC();
      setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupWebRTC, joinWebRTC]);

  const sendChatMessage = useCallback(
    async (author: string, content: string, djPassword?: string) => {
      await fetch("/api/live/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, content, djPassword }),
      });
    },
    [],
  );

  return {
    chatMessages, viewerCount, streamStatus, isConnected, remoteStream, sendChatMessage,
    scheduledLive,
    pendingInvite, guestStream, acceptInvite, declineInvite, stopGuest,
    coHostStreams, activeAngle, setActiveAngle,
  };
}
