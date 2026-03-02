"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { LiveChatMessage, LiveStreamStatus } from "@/shared/types";

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 5,
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
      cachedIceConfig = {
        iceServers: servers,
        bundlePolicy: "max-bundle",
        iceCandidatePoolSize: 5,
      };
      cacheTime = Date.now();
      return cachedIceConfig;
    }
  } catch {}
  return DEFAULT_ICE;
}

// Minimize jitter buffer on received tracks
function setLowLatencyReceiver(receiver: RTCRtpReceiver) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = receiver as any;
    if ("playoutDelayHint" in r) r.playoutDelayHint = 0;
    if ("jitterBufferTarget" in r) r.jitterBufferTarget = 0;
  } catch {}
}

// Set low-latency encoding parameters on video senders
async function setLowLatencyEncoding(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    try {
      if ("contentHint" in sender.track) {
        sender.track.contentHint = "motion";
      }
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      params.degradationPreference = "maintain-framerate";
      params.encodings[0].maxBitrate = 1_500_000;
      params.encodings[0].maxFramerate = 30;
      await sender.setParameters(params);
    } catch {}
  }
}

export interface ScheduledLiveData {
  date: string;
  venue: string;
  city: string;
  flyerUrl?: string;
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
  broadcasterId?: string;
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
  const [coHostNames, setCoHostNames] = useState<Map<string, string>>(new Map());
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
  const inviteBroadcasterRef = useRef<string | null>(null);
  // Ref to always dispatch to the latest handleSignal from the SSE listener
  const handleSignalRef = useRef<((signal: { type: string; from: string; data: unknown; name?: string }) => Promise<void>) | undefined>(undefined);
  // Buffer ICE candidates that arrive before setRemoteDescription
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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
  const handleSignal = useCallback(async (signal: { type: string; from: string; data: unknown; name?: string }) => {
    const { type, from, data, name: signalName } = signal;
    console.log("[Viewer] signal received:", type, "from:", from);

    if (type === "offer") {
      // If we have a guest stream ready and a main connection exists,
      // this offer from the broadcaster is for the guest peer connection
      if (guestStreamRef.current && from === mainBroadcasterRef.current && pcRef.current) {
        if (guestPcRef.current) {
          guestPcRef.current.close();
        }

        const pc = new RTCPeerConnection(await getIceServers());
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
        // Flush buffered ICE candidates
        const pendingGuest = pendingCandidatesRef.current.get("guest:" + from);
        if (pendingGuest) { for (const c of pendingGuest) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} } pendingCandidatesRef.current.delete("guest:" + from); }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setLowLatencyEncoding(pc);

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

        const pc = new RTCPeerConnection(await getIceServers());
        pcRef.current = pc;

        pc.ontrack = (event) => {
          setLowLatencyReceiver(event.receiver);
          // Create our own MediaStream — using event.streams[0] causes 0x0
          // rendering in Firefox (same workaround as WHEP and co-host streams)
          setRemoteStream((prev) => {
            const stream = prev || new MediaStream();
            if (!stream.getTrackById(event.track.id)) {
              stream.addTrack(event.track);
            }
            return stream;
          });
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

        let mainDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            if (mainDisconnectTimer) clearTimeout(mainDisconnectTimer);
            if (pcRef.current === pc) {
              pcRef.current = null;
              setRemoteStream(null);
            }
          } else if (pc.connectionState === "disconnected") {
            mainDisconnectTimer = setTimeout(() => {
              if (pc.connectionState !== "connected" && pcRef.current === pc) {
                pcRef.current = null;
                setRemoteStream(null);
              }
            }, 10000);
          } else if (pc.connectionState === "connected") {
            if (mainDisconnectTimer) {
              clearTimeout(mainDisconnectTimer);
              mainDisconnectTimer = null;
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        // Flush buffered ICE candidates
        const pendingMain = pendingCandidatesRef.current.get("main:" + from);
        if (pendingMain) { for (const c of pendingMain) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} } pendingCandidatesRef.current.delete("main:" + from); }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setLowLatencyEncoding(pc);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", from: clientIdRef.current, to: from, data: answer }),
        });
      } else {
        // Co-host offer — store guest name if provided
        console.log("[Viewer] co-host offer from", from, signalName ? `(name: ${signalName})` : "");
        if (signalName) {
          setCoHostNames((prev) => new Map(prev).set(from, signalName));
        }
        const existingPc = coHostPcsRef.current.get(from);
        if (existingPc) {
          existingPc.close();
          coHostPcsRef.current.delete(from);
        }

        const pc = new RTCPeerConnection(await getIceServers());
        coHostPcsRef.current.set(from, pc);

        pc.ontrack = (event) => {
          setLowLatencyReceiver(event.receiver);
          console.log("[Viewer] co-host track received from", from, "kind:", event.track.kind, "readyState:", event.track.readyState);
          // Create our own MediaStream and add tracks manually.
          // Using event.streams[0] directly causes 0x0 resolution rendering
          // in Firefox despite frames being decoded (same issue as WHEP).
          setCoHostStreams((prev) => {
            const existing = prev.get(from);
            if (existing) {
              // Add track to existing stream if not already there
              if (!existing.getTrackById(event.track.id)) {
                existing.addTrack(event.track);
              }
              // Return new Map to trigger React re-render
              return new Map(prev);
            }
            // First track — create a new MediaStream
            const newStream = new MediaStream();
            newStream.addTrack(event.track);
            return new Map(prev).set(from, newStream);
          });
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

        let coHostDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
        const removeCoHostPeer = () => {
          coHostPcsRef.current.delete(from);
          setCoHostStreams((prev) => {
            const next = new Map(prev);
            next.delete(from);
            return next;
          });
          setCoHostNames((prev) => {
            const next = new Map(prev);
            next.delete(from);
            return next;
          });
        };
        pc.onconnectionstatechange = () => {
          console.log("[Viewer] co-host peer", from, "state →", pc.connectionState);
          if (pc.connectionState === "failed") {
            if (coHostDisconnectTimer) clearTimeout(coHostDisconnectTimer);
            removeCoHostPeer();
          } else if (pc.connectionState === "disconnected") {
            // Grace period — "disconnected" is often temporary
            coHostDisconnectTimer = setTimeout(() => {
              if (pc.connectionState !== "connected") {
                removeCoHostPeer();
              }
            }, 10000);
          } else if (pc.connectionState === "connected") {
            // Recovered — cancel pending removal
            if (coHostDisconnectTimer) {
              clearTimeout(coHostDisconnectTimer);
              coHostDisconnectTimer = null;
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        // Flush buffered ICE candidates
        const pendingCo = pendingCandidatesRef.current.get("co:" + from);
        if (pendingCo) { for (const c of pendingCo) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} } pendingCandidatesRef.current.delete("co:" + from); }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setLowLatencyEncoding(pc);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", from: clientIdRef.current, to: from, data: answer }),
        });
      }
    } else if (type === "answer") {
      // Answer for our outgoing guest peer (HLS invite mode — viewer sent offer to admin)
      if (guestPcRef.current && guestPcRef.current.signalingState === "have-local-offer") {
        await guestPcRef.current.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        const pendingGuest = pendingCandidatesRef.current.get("guest:" + from);
        if (pendingGuest) { for (const c of pendingGuest) { try { await guestPcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {} } pendingCandidatesRef.current.delete("guest:" + from); }
      }
    } else if (type === "guest-disconnect") {
      // Broadcaster disconnected us as a guest — stop sharing camera
      guestStreamRef.current?.getTracks().forEach((t) => t.stop());
      setGuestStream(null);
      guestStreamRef.current = null;
      if (guestPcRef.current) {
        guestPcRef.current.close();
        guestPcRef.current = null;
      }
    } else if (type === "ice-candidate") {
      // Buffer ICE candidates if remote description not yet set
      // Check main broadcaster
      if (pcRef.current && from === mainBroadcasterRef.current) {
        if (pcRef.current.remoteDescription) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get("main:" + from) || [];
          pending.push(data as RTCIceCandidateInit);
          pendingCandidatesRef.current.set("main:" + from, pending);
        }
      }
      // Check guest peer (from broadcaster in P2P mode, or from admin in HLS invite mode)
      if (guestPcRef.current && (from === mainBroadcasterRef.current || from === inviteBroadcasterRef.current)) {
        if (guestPcRef.current.remoteDescription) {
          try { await guestPcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get("guest:" + from) || [];
          pending.push(data as RTCIceCandidateInit);
          pendingCandidatesRef.current.set("guest:" + from, pending);
        }
      }
      // Check co-host peers
      const coHostPc = coHostPcsRef.current.get(from);
      if (coHostPc) {
        if (coHostPc.remoteDescription) {
          try { await coHostPc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get("co:" + from) || [];
          pending.push(data as RTCIceCandidateInit);
          pendingCandidatesRef.current.set("co:" + from, pending);
        }
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

      if (streamStatus.streamType === "webrtc") {
        // P2P mode: signal the broadcaster, they'll create a peer for us
        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "guest-ready", from: clientIdRef.current, data: { inviteId, name } }),
        });
      } else if (inviteBroadcasterRef.current) {
        // HLS/WHIP mode: we create the P2P connection and send offer to admin
        const adminId = inviteBroadcasterRef.current;

        if (guestPcRef.current) guestPcRef.current.close();

        const pc = new RTCPeerConnection(await getIceServers());
        guestPcRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate && clientIdRef.current) {
            fetch("/api/live/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ice-candidate", from: clientIdRef.current, to: adminId, data: event.candidate }),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            guestPcRef.current = null;
            guestStreamRef.current?.getTracks().forEach((t) => t.stop());
            setGuestStream(null);
            guestStreamRef.current = null;
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "offer", from: clientIdRef.current, to: adminId, data: offer, name }),
        });
      }
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
    // Use ref to always get the latest stream (avoids stale closure)
    guestStreamRef.current?.getTracks().forEach((t) => t.stop());
    setGuestStream(null);
    guestStreamRef.current = null;
    if (guestPcRef.current) {
      guestPcRef.current.close();
      guestPcRef.current = null;
    }
  }, []);

  // Invite a random viewer (admin only — uses this client's SSE clientId)
  const [inviting, setInviting] = useState(false);

  const inviteRandomViewer = useCallback(async () => {
    if (!clientIdRef.current) return;
    setInviting(true);
    try {
      const res = await fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invite-viewer", from: clientIdRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[Invite]", data.error || "No viewer available");
      }
    } catch {
      console.error("[Invite] Failed to invite viewer");
    } finally {
      setInviting(false);
    }
  }, []);

  // Disconnect an invited guest (close their co-host P2P connection)
  const disconnectInvitedGuest = useCallback((guestId: string) => {
    const pc = coHostPcsRef.current.get(guestId);
    if (pc) {
      pc.close();
      coHostPcsRef.current.delete(guestId);
    }
    setCoHostStreams((prev) => {
      const next = new Map(prev);
      next.delete(guestId);
      return next;
    });
    // Signal the guest to stop sharing camera
    if (clientIdRef.current) {
      fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "guest-disconnect", from: clientIdRef.current, to: guestId }),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const es = new EventSource("/api/live/stream");
      esRef.current = es;

      // Retry viewer-join if co-host P2P doesn't establish within 5s
      let viewerJoinRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let viewerJoinRetries = 0;
      const MAX_VIEWER_JOIN_RETRIES = 3;
      const sendViewerJoinWithRetry = (fromId: string, expectedCoHosts: number) => {
        if (viewerJoinRetryTimer) clearTimeout(viewerJoinRetryTimer);
        viewerJoinRetries = 0;
        const doSend = () => {
          console.log("[Viewer] sending viewer-join (attempt", viewerJoinRetries + 1, ")");
          fetch("/api/live/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "viewer-join", from: fromId }),
          });
          viewerJoinRetries++;
          // Schedule retry if we don't get co-host peers
          if (viewerJoinRetries < MAX_VIEWER_JOIN_RETRIES) {
            viewerJoinRetryTimer = setTimeout(() => {
              if (coHostPcsRef.current.size < expectedCoHosts) {
                console.log("[Viewer] retry viewer-join: only", coHostPcsRef.current.size, "co-host peers, expected", expectedCoHosts);
                doSend();
              }
            }, 5000);
          }
        };
        setTimeout(doSend, 500);
      };

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
        } else if (data.status.isLive && data.status.streamType !== "webrtc") {
          // HLS/WHIP mode — mark so co-host P2P offers are treated correctly
          mainBroadcasterRef.current = "__hls__";
          // If co-hosts are already connected, send viewer-join so they
          // create P2P connections with us (same as the "co-hosts" SSE handler)
          const initCoHosts = (data as { coHostIds?: string[] }).coHostIds;
          if (initCoHosts && initCoHosts.length > 0 && data.clientId) {
            console.log("[Viewer] init: live WHEP with", initCoHosts.length, "co-hosts, sending viewer-join");
            sendViewerJoinWithRetry(data.clientId, initCoHosts.length);
          }
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
          } else {
            // HLS/WHIP mode — mark broadcaster as HLS so co-host P2P offers
            // are correctly treated as co-host streams (not main broadcaster)
            mainBroadcasterRef.current = "__hls__";
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

      // Signal queue — process signals one at a time to prevent race conditions
      const signalQueue: unknown[] = [];
      let processingSignals = false;
      const processSignalQueue = async () => {
        if (processingSignals) return;
        processingSignals = true;
        while (signalQueue.length > 0) {
          const sig = signalQueue.shift();
          try { await handleSignalRef.current?.(sig as { type: string; from: string; data: unknown; name?: string }); } catch (err) { console.warn("[Signal]", err); }
        }
        processingSignals = false;
      };
      es.addEventListener("signal", (e) => {
        const signal = JSON.parse(e.data);
        signalQueue.push(signal);
        processSignalQueue();
      });

      es.addEventListener("co-hosts", (e) => {
        const { coHostIds } = JSON.parse(e.data) as { coHostIds: string[] };
        console.log("[Viewer] co-hosts SSE event:", coHostIds.length, "co-hosts, clientId:", clientIdRef.current);
        // When new co-hosts join, re-send viewer-join so they create peer connections with us
        if (coHostIds.length > 0 && clientIdRef.current) {
          sendViewerJoinWithRetry(clientIdRef.current, coHostIds.length);
        }
      });

      es.addEventListener("invite", (e) => {
        const data = JSON.parse(e.data) as { inviteId: string; viewerId: string; broadcasterId?: string };
        inviteBroadcasterRef.current = data.broadcasterId || null;
        setPendingInvite({ inviteId: data.inviteId, broadcasterId: data.broadcasterId });
      });

      es.onerror = () => {
        es.close();
        setIsConnected(false);
        if (viewerJoinRetryTimer) clearTimeout(viewerJoinRetryTimer);
        cleanupWebRTC();
        if (!cancelled) {
          const delay = retryRef.current;
          retryRef.current = Math.min(delay * 2, 30000);
          setTimeout(connect, delay);
        }
      };
    }

    connect();

    // Also send viewer-leave on page close/refresh for reliability
    const handleUnload = () => {
      if (clientIdRef.current) {
        navigator.sendBeacon(
          "/api/live/signal",
          new Blob([JSON.stringify({ type: "viewer-leave", from: clientIdRef.current })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleUnload);
      // Notify the broadcaster that we're leaving
      if (clientIdRef.current) {
        fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "viewer-leave", from: clientIdRef.current }),
        }).catch(() => {});
      }
      esRef.current?.close();
      cleanupWebRTC();
      // Cleanup guest stream if active
      guestStreamRef.current?.getTracks().forEach((t) => t.stop());
      guestStreamRef.current = null;
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
    coHostStreams, coHostNames, activeAngle, setActiveAngle,
    inviteRandomViewer, inviting, disconnectInvitedGuest,
    sseClientId: clientIdRef.current,
  };
}
