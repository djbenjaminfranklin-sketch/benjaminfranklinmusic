"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 5,
};

// Fetch dynamic TURN credentials from our API (Metered.ca)
// Falls back to STUN-only if TURN is not configured
let cachedIceConfig: RTCConfiguration | null = null;
let cacheTime = 0;
async function getIceServers(): Promise<RTCConfiguration> {
  // Cache for 30 minutes
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

// Minimize jitter buffer on a received track for near-realtime playback
function setLowLatencyReceiver(receiver: RTCRtpReceiver) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = receiver as any;
    if ("playoutDelayHint" in r) r.playoutDelayHint = 0;
    if ("jitterBufferTarget" in r) r.jitterBufferTarget = 0;
  } catch {}
}

// Set low-latency encoding parameters on all video senders
async function setLowLatencyEncoding(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    try {
      // Hint the encoder that this is motion-heavy (live camera)
      if ("contentHint" in sender.track) {
        sender.track.contentHint = "motion";
      }
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      params.degradationPreference = "maintain-framerate";
      // Lower bitrate = faster encode/decode = less latency
      params.encodings[0].maxBitrate = 1_500_000;
      params.encodings[0].maxFramerate = 30;
      await sender.setParameters(params);
    } catch {}
  }
}

export function useLiveBroadcast() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [guestStreams, setGuestStreams] = useState<Map<string, MediaStream>>(new Map());
  const [inviting, setInviting] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMuted, setIsMuted] = useState(false);
  const [guestNames, setGuestNames] = useState<Map<string, string>>(new Map());

  const clientIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const guestPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  // Ref to always call the latest handleSignal from EventSource listeners (avoids stale closures)
  const handleSignalRef = useRef<((signal: { type: string; from: string; to?: string; data: unknown }) => Promise<void>) | undefined>(undefined);
  // Buffer ICE candidates that arrive before setRemoteDescription (race condition fix)
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Nettoyer un peer
  const cleanupPeer = useCallback((viewerId: string) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(viewerId);
    }
    pendingCandidatesRef.current.delete(viewerId);
  }, []);

  // Créer un peer connection pour un viewer
  const createPeerForViewer = useCallback(async (viewerId: string) => {
    if (!streamRef.current) return;

    // Close any existing peer for this viewer first
    const existing = peersRef.current.get(viewerId);
    if (existing) {
      existing.close();
      peersRef.current.delete(viewerId);
    }

    const pc = new RTCPeerConnection(await getIceServers());
    peersRef.current.set(viewerId, pc);

    // Ajouter les tracks locaux (caméra + micro)
    streamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    // Envoyer les ICE candidates au viewer
    pc.onicecandidate = (event) => {
      if (event.candidate && clientIdRef.current) {
        fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ice-candidate",
            from: clientIdRef.current,
            to: viewerId,
            data: event.candidate,
          }),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupPeer(viewerId);
        setViewerCount(peersRef.current.size);
      }
    };

    // Créer l'offre et l'envoyer au viewer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setLowLatencyEncoding(pc);

    await fetch("/api/live/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "offer",
        from: clientIdRef.current,
        to: viewerId,
        data: offer,
      }),
    });

    setViewerCount(peersRef.current.size);
  }, [cleanupPeer]);

  // Create a peer connection for a guest/co-host (receive their camera)
  const createPeerForGuest = useCallback(async (guestId: string) => {
    // Close any existing guest peer for this ID
    const existing = guestPeersRef.current.get(guestId);
    if (existing) {
      existing.close();
      guestPeersRef.current.delete(guestId);
    }

    const pc = new RTCPeerConnection(await getIceServers());
    guestPeersRef.current.set(guestId, pc);

    // Add local tracks so the offer has proper media lines for bidirectional exchange.
    // This makes the SDP negotiation more reliable across browsers than recvonly offers.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current!);
      });
    }

    // Receive guest's tracks — with low-latency receiver settings
    pc.ontrack = (event) => {
      setLowLatencyReceiver(event.receiver);
      const stream = event.streams[0];
      if (stream) {
        setGuestStreams((prev) => new Map(prev).set(guestId, stream));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && clientIdRef.current) {
        fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ice-candidate",
            from: clientIdRef.current,
            to: guestId,
            data: event.candidate,
          }),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        pc.close();
        guestPeersRef.current.delete(guestId);
        pendingCandidatesRef.current.delete(guestId);
        setGuestStreams((prev) => {
          const next = new Map(prev);
          next.delete(guestId);
          return next;
        });
      }
    };

    // Create offer — bidirectional with local tracks already added
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setLowLatencyEncoding(pc);

    await fetch("/api/live/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "offer",
        from: clientIdRef.current,
        to: guestId,
        data: offer,
      }),
    });
  }, []);

  // Invite a random viewer
  const inviteRandomViewer = useCallback(async () => {
    if (!clientIdRef.current) {
      setError("Connecting, please try again shortly");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invite-viewer", from: clientIdRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No viewer available");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Unable to invite viewer");
      setTimeout(() => setError(null), 3000);
    } finally {
      setInviting(false);
    }
  }, []);

  // Disconnect a guest — close local peer and notify the guest via signaling
  const disconnectGuest = useCallback((guestId: string) => {
    const pc = guestPeersRef.current.get(guestId);
    if (pc) {
      pc.close();
      guestPeersRef.current.delete(guestId);
    }
    pendingCandidatesRef.current.delete(guestId);
    setGuestStreams((prev) => {
      const next = new Map(prev);
      next.delete(guestId);
      return next;
    });
    setGuestNames((prev) => {
      const next = new Map(prev);
      next.delete(guestId);
      return next;
    });
    // Notify the guest that they've been disconnected
    if (clientIdRef.current) {
      fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "guest-disconnect",
          from: clientIdRef.current,
          to: guestId,
        }),
      });
    }
  }, []);

  // Toggle mute — modifies both the track AND the React state for proper re-render
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  // Gérer les signaux entrants
  const handleSignal = useCallback(async (signal: { type: string; from: string; to?: string; data: unknown }) => {
    const { type, from, data } = signal;

    if (type === "co-host-join") {
      // A co-host joined — create a receiving peer connection to get their stream
      await createPeerForGuest(from);
    } else if (type === "viewer-join") {
      // Un nouveau viewer veut se connecter (ou re-join suite à un nouveau co-host)
      // Si on a déjà une peer connection active avec ce viewer, on skip
      const existingPc = peersRef.current.get(from);
      if (existingPc && existingPc.connectionState === "connected") {
        return; // Already connected, skip duplicate
      }
      await createPeerForViewer(from);
    } else if (type === "offer") {
      // Offer received — either from broadcaster asking for our stream (we're co-host),
      // or from a co-host sending their stream (we're broadcaster)
      const existingGuestPc = guestPeersRef.current.get(from);
      if (existingGuestPc) {
        existingGuestPc.close();
        guestPeersRef.current.delete(from);
      }

      const pc = new RTCPeerConnection(await getIceServers());
      guestPeersRef.current.set(from, pc);

      // If we have a local stream, add our tracks so they can receive our camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        setLowLatencyReceiver(event.receiver);
        const stream = event.streams[0];
        if (stream) {
          setGuestStreams((prev) => new Map(prev).set(from, stream));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && clientIdRef.current) {
          fetch("/api/live/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "ice-candidate",
              from: clientIdRef.current,
              to: from,
              data: event.candidate,
            }),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          pc.close();
          guestPeersRef.current.delete(from);
          pendingCandidatesRef.current.delete(from);
          setGuestStreams((prev) => {
            const next = new Map(prev);
            next.delete(from);
            return next;
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
      // Flush any ICE candidates that arrived before remote description was set
      const pendingOffer = pendingCandidatesRef.current.get(from);
      if (pendingOffer) {
        for (const c of pendingOffer) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        pendingCandidatesRef.current.delete(from);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      setLowLatencyEncoding(pc);

      await fetch("/api/live/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "answer",
          from: clientIdRef.current,
          to: from,
          data: answer,
        }),
      });
    } else if (type === "guest-ready") {
      // A viewer accepted the invite and is ready to share their camera
      const guestData = data as { inviteId?: string; name?: string } | undefined;
      if (guestData?.name) {
        setGuestNames((prev) => new Map(prev).set(from, guestData.name!));
      }
      await createPeerForGuest(from);
    } else if (type === "answer") {
      // Le viewer a répondu avec une answer
      const pc = peersRef.current.get(from);
      if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        // Flush any ICE candidates that arrived before the answer
        const pending = pendingCandidatesRef.current.get(from);
        if (pending) {
          for (const c of pending) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          pendingCandidatesRef.current.delete(from);
        }
      }
      // Also check guest peers
      const guestPc = guestPeersRef.current.get(from);
      if (guestPc && guestPc.signalingState === "have-local-offer") {
        await guestPc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        // Flush any ICE candidates that arrived before the answer
        const pending = pendingCandidatesRef.current.get(from);
        if (pending) {
          for (const c of pending) {
            try { await guestPc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          pendingCandidatesRef.current.delete(from);
        }
      }
    } else if (type === "ice-candidate") {
      // ICE candidate — buffer if remote description not yet set (race condition)
      const pc = peersRef.current.get(from);
      if (pc) {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get(from) || [];
          pending.push(data as RTCIceCandidateInit);
          pendingCandidatesRef.current.set(from, pending);
        }
      }
      // Also check guest peers
      const guestPc = guestPeersRef.current.get(from);
      if (guestPc) {
        if (guestPc.remoteDescription) {
          try { await guestPc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch {}
        } else {
          const pending = pendingCandidatesRef.current.get(from) || [];
          pending.push(data as RTCIceCandidateInit);
          pendingCandidatesRef.current.set(from, pending);
        }
      }
    } else if (type === "viewer-leave") {
      cleanupPeer(from);
      setViewerCount(peersRef.current.size);
    }
  }, [createPeerForViewer, createPeerForGuest, cleanupPeer]);

  // Keep the ref in sync with the latest handleSignal
  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  // Switch camera front/back — uses exact facingMode first (Android), fallback without exact
  const switchCamera = useCallback(async () => {
    if (!streamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    const newFacing = facingMode === "user" ? "environment" : "user";

    try {
      let newStream: MediaStream;
      try {
        // Try exact facingMode first (required on many Android devices)
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: newFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        // Fallback without exact constraint
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      }

      // Replace video track in all peer connections
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      // Keep old audio mute state
      const oldAudioTrack = streamRef.current.getAudioTracks()[0];
      if (oldAudioTrack && newAudioTrack) {
        newAudioTrack.enabled = oldAudioTrack.enabled;
      }

      // Replace tracks in all peer connections (skip failed peers)
      const allPeers = [...peersRef.current.values(), ...guestPeersRef.current.values()];
      for (const pc of allPeers) {
        if (pc.connectionState === "closed" || pc.connectionState === "failed") continue;
        try {
          const senders = pc.getSenders();
          for (const sender of senders) {
            if (sender.track?.kind === "video" && newVideoTrack) {
              await sender.replaceTrack(newVideoTrack);
            }
            if (sender.track?.kind === "audio" && newAudioTrack) {
              await sender.replaceTrack(newAudioTrack);
            }
          }
        } catch {
          // Skip this peer, continue with others
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

  // Setup SSE connection and signal handling (shared logic for broadcaster and co-host)
  const setupSSE = useCallback((onInit: (clientId: string) => void) => {
    const es = new EventSource("/api/live/stream");
    esRef.current = es;

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      clientIdRef.current = data.clientId;
      onInit(data.clientId);
    });

    // Signal queue — process signals one at a time to prevent race conditions
    // (e.g., ICE candidates arriving before offer/answer is fully processed)
    const signalQueue: unknown[] = [];
    let processingSignals = false;
    const processSignalQueue = async () => {
      if (processingSignals) return;
      processingSignals = true;
      while (signalQueue.length > 0) {
        const sig = signalQueue.shift();
        try { await handleSignalRef.current?.(sig as { type: string; from: string; to?: string; data: unknown }); } catch {}
      }
      processingSignals = false;
    };

    es.addEventListener("signal", (e) => {
      const signal = JSON.parse(e.data);
      signalQueue.push(signal);
      processSignalQueue();
    });

    es.addEventListener("presence", (e) => {
      const { viewerCount: count } = JSON.parse(e.data);
      setViewerCount(Math.max(0, count - 1));
    });

    es.addEventListener("invite-response", (e) => {
      const { accepted } = JSON.parse(e.data);
      if (!accepted) {
        setError("Viewer declined the invite");
        setTimeout(() => setError(null), 3000);
      }
    });

    es.onerror = () => {
      // Reconnexion gérée par l'EventSource
    };

    return es;
  }, []);

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

  // Démarrer le broadcast
  const startBroadcast = useCallback(async (options?: { video?: boolean; audio?: boolean; venue?: string }) => {
    setError(null);

    try {
      // Get camera first (permission prompt)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: options?.video !== false ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: options?.audio !== false,
      });

      streamRef.current = stream;
      setLocalStream(stream);

      setupSSE((clientId) => {
        // Start broadcast immediately (don't wait for geolocation)
        fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "start-broadcast",
            from: clientId,
            venue: options?.venue,
          }),
        });

        // Auto-detect venue in background, update server when ready
        if (!options?.venue) {
          detectVenue().then((geoResult) => {
            if (geoResult.venue || geoResult.lat) {
              fetch("/api/live/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "update-location",
                  venue: geoResult.venue,
                  lat: geoResult.lat,
                  lng: geoResult.lng,
                }),
              });
            }
          });
        }
      });

      setIsBroadcasting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access camera");
    }
  }, [setupSSE, detectVenue]);

  // Arrêter le broadcast
  const stopBroadcast = useCallback(async () => {
    // Fermer toutes les peer connections
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    guestPeersRef.current.forEach((pc) => pc.close());
    guestPeersRef.current.clear();
    pendingCandidatesRef.current.clear();
    setGuestStreams(new Map());
    setGuestNames(new Map());

    // Arrêter le stream local
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);

    // Cleanup mixed audio context if active
    if (mixedAudioCtxRef.current) {
      mixedAudioCtxRef.current.close().catch(() => {});
      mixedAudioCtxRef.current = null;
    }
    externalStreamRef.current?.getTracks().forEach((t) => t.stop());
    externalStreamRef.current = null;

    // Signaler l'arrêt au serveur
    if (clientIdRef.current) {
      try {
        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "stop-broadcast",
            from: clientIdRef.current,
          }),
        });
      } catch {
        // Fallback: use sendBeacon if fetch fails
        navigator.sendBeacon(
          "/api/live/signal",
          new Blob([JSON.stringify({ type: "stop-broadcast", from: clientIdRef.current })], { type: "application/json" })
        );
      }
    }

    // Fermer le SSE
    esRef.current?.close();
    esRef.current = null;
    clientIdRef.current = null;

    setIsBroadcasting(false);
    setIsCoHost(false);
    setViewerCount(0);
  }, []);

  // Rejoindre en tant que co-host
  const joinAsCoHost = useCallback(async (options?: { video?: boolean; audio?: boolean; coHostCode?: string }) => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: options?.video !== false ? { facingMode: "environment", width: { ideal: 960 }, height: { ideal: 540 } } : false,
        audio: options?.audio !== false,
      });

      // Hint video track for motion content (faster encoding)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "contentHint" in videoTrack) {
        videoTrack.contentHint = "motion";
      }

      // Mute audio by default for co-hosts
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }

      streamRef.current = stream;
      setLocalStream(stream);
      setIsMuted(true);

      setupSSE((clientId) => {
        fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "co-host-join",
            from: clientId,
            coHostCode: options?.coHostCode,
          }),
        });
      });

      setIsBroadcasting(true);
      setIsCoHost(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access camera");
    }
  }, [setupSSE]);

  const leaveCoHost = useCallback(async () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    guestPeersRef.current.forEach((pc) => pc.close());
    guestPeersRef.current.clear();
    pendingCandidatesRef.current.clear();
    setGuestStreams(new Map());

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);

    // Cleanup mixed audio context if active
    if (mixedAudioCtxRef.current) {
      mixedAudioCtxRef.current.close().catch(() => {});
      mixedAudioCtxRef.current = null;
    }
    externalStreamRef.current?.getTracks().forEach((t) => t.stop());
    externalStreamRef.current = null;

    if (clientIdRef.current) {
      try {
        await fetch("/api/live/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "co-host-leave", from: clientIdRef.current }),
        });
      } catch {
        navigator.sendBeacon(
          "/api/live/signal",
          new Blob([JSON.stringify({ type: "co-host-leave", from: clientIdRef.current })], { type: "application/json" })
        );
      }
    }

    esRef.current?.close();
    esRef.current = null;
    clientIdRef.current = null;

    setIsBroadcasting(false);
    setIsCoHost(false);
  }, []);

  // Replace the audio source on all peer connections
  // In "external" mode: mixes USB device (music) + internal mic (voice)
  // In "internal" mode: just the phone mic
  const mixedAudioCtxRef = useRef<AudioContext | null>(null);
  const externalStreamRef = useRef<MediaStream | null>(null);

  const replaceAudioSource = useCallback(async (mode: "internal" | "external" | "both", extDevId?: string | null, intDevId?: string | null) => {
    if (!streamRef.current) return;

    try {
      // Cleanup previous mixed context
      if (mixedAudioCtxRef.current) {
        mixedAudioCtxRef.current.close().catch(() => {});
        mixedAudioCtxRef.current = null;
      }
      externalStreamRef.current?.getTracks().forEach((t) => t.stop());
      externalStreamRef.current = null;

      const oldAudioTrack = streamRef.current.getAudioTracks()[0];
      const wasMuted = oldAudioTrack ? !oldAudioTrack.enabled : false;

      if (mode === "internal") {
        // Internal mic only — reuse the existing audio track from the stream
        // Do NOT call getUserMedia again on iOS (it kills the video)
        // The original stream already has the mic audio track
        // Just make sure no external mixing is active (cleaned up above)
        return;
      }

      let newAudioTrack: MediaStreamTrack;

      if (mode === "external" && extDevId) {
        // USB only — mixer audio, no mic
        const mixerStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: extDevId } },
        });
        externalStreamRef.current = mixerStream;
        newAudioTrack = mixerStream.getAudioTracks()[0];

      } else if (mode === "both" && extDevId) {
        // USB + Micro — mix both via Web Audio API
        const mixerStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: extDevId } },
        });
        externalStreamRef.current = mixerStream;

        // Reuse the existing mic track from the broadcast stream (don't call getUserMedia again)
        const existingMicTrack = streamRef.current.getAudioTracks()[0];

        const audioCtx = new AudioContext();
        mixedAudioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();

        // Mixer (music) — full volume
        const mixerSource = audioCtx.createMediaStreamSource(mixerStream);
        const mixerGain = audioCtx.createGain();
        mixerGain.gain.value = 1.0;
        mixerSource.connect(mixerGain).connect(dest);

        // Mic (voice) — reuse existing track
        if (existingMicTrack) {
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([existingMicTrack]));
          const micGain = audioCtx.createGain();
          micGain.gain.value = 0.8;
          micSource.connect(micGain).connect(dest);
        }

        newAudioTrack = dest.stream.getAudioTracks()[0];
      } else {
        return; // No external device, nothing to do
      }

      // Keep mute state
      if (wasMuted) newAudioTrack.enabled = false;

      // Replace audio track in all peer connections
      const allPeers = [...peersRef.current.values(), ...guestPeersRef.current.values()];
      for (const pc of allPeers) {
        if (pc.connectionState === "closed" || pc.connectionState === "failed") continue;
        try {
          for (const sender of pc.getSenders()) {
            if (sender.track?.kind === "audio") {
              await sender.replaceTrack(newAudioTrack);
            }
          }
        } catch {}
      }

      // Update the audio track in streamRef WITHOUT creating a new MediaStream
      // (creating a new stream triggers re-renders and can cause loops)
      if (oldAudioTrack && oldAudioTrack !== newAudioTrack) {
        streamRef.current.removeTrack(oldAudioTrack);
        // Don't stop the old mic track — we might still need it for "both" mode
      }
      if (!streamRef.current.getAudioTracks().includes(newAudioTrack)) {
        streamRef.current.addTrack(newAudioTrack);
      }
    } catch (err) {
      console.error("[Audio] Failed to switch audio source:", err);
    }
  }, []);

  // Send stop-broadcast (or co-host-leave) on page close/refresh
  useEffect(() => {
    if (!isBroadcasting) return;
    const handleUnload = () => {
      if (clientIdRef.current) {
        const signalType = isCoHost ? "co-host-leave" : "stop-broadcast";
        navigator.sendBeacon(
          "/api/live/signal",
          new Blob([JSON.stringify({ type: signalType, from: clientIdRef.current })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [isBroadcasting, isCoHost]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      if (isBroadcasting) {
        // Signal server to stop (co-host-leave if co-host, stop-broadcast if main)
        if (clientIdRef.current) {
          const signalType = isCoHost ? "co-host-leave" : "stop-broadcast";
          navigator.sendBeacon(
            "/api/live/signal",
            new Blob([JSON.stringify({ type: signalType, from: clientIdRef.current })], { type: "application/json" })
          );
        }
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
        guestPeersRef.current.forEach((pc) => pc.close());
        guestPeersRef.current.clear();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        esRef.current?.close();
        // Cleanup mixed audio
        if (mixedAudioCtxRef.current) {
          mixedAudioCtxRef.current.close().catch(() => {});
        }
        externalStreamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isBroadcasting, isCoHost]);

  return {
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
  };
}
