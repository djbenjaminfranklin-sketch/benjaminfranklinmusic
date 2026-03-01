import { EventEmitter } from "events";
import crypto from "crypto";
import type { ChatMessage, LiveChatMessage, LiveStreamStatus } from "@/shared/types";

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

// --- In-memory stores ---

let chatMessages: ChatMessage[] = [];
let liveChatMessages: LiveChatMessage[] = [];
let liveStreamStatus: LiveStreamStatus = {
  isLive: false,
  streamUrl: null,
  streamType: null,
  currentTrack: null,
  startedAt: null,
};

const chatClients = new Map<string, boolean>();
const liveClients = new Map<string, boolean>();

// Cloudflare Stream Live Input uid (set when using WHIP mode)
let cloudflareStreamUid: string | null = null;

export function setCloudflareStreamUid(uid: string | null) {
  cloudflareStreamUid = uid;
}

export function getCloudflareStreamUid(): string | null {
  return cloudflareStreamUid;
}

// WebRTC broadcasters (main + up to 3 co-hosts)
let broadcasterId: string | null = null;
const coHostIds = new Set<string>();
const MAX_CO_HOSTS = 3;

// Co-host invite code (generated when live starts)
let coHostCode: string | null = null;

// --- Heartbeat ---

setInterval(() => {
  emitter.emit("chat:heartbeat");
  emitter.emit("live:heartbeat");
}, 30_000);

// --- Chat API ---

export function connectChat(clientId: string) {
  chatClients.set(clientId, true);
  emitter.emit("chat:presence", { onlineCount: chatClients.size });
}

export function disconnectChat(clientId: string) {
  chatClients.delete(clientId);
  emitter.emit("chat:presence", { onlineCount: chatClients.size });
}

export function getChatState() {
  return {
    messages: chatMessages,
    onlineCount: chatClients.size,
  };
}

export function addChatMessage(
  author: string,
  content: string,
  isDJ: boolean,
  audioUrl?: string,
  audioTitle?: string,
  imageUrl?: string,
  imageCaption?: string,
  videoUrl?: string,
  videoCaption?: string,
): ChatMessage {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    author,
    content,
    timestamp: new Date().toISOString(),
    isDJ,
    reactions: {},
    audioUrl,
    audioTitle,
    imageUrl,
    imageCaption,
    videoUrl,
    videoCaption,
  };
  chatMessages.push(msg);
  if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
  emitter.emit("chat:message", msg);
  return msg;
}

export function deleteChatMessage(id: string): boolean {
  const index = chatMessages.findIndex((m) => m.id === id);
  if (index === -1) return false;
  chatMessages.splice(index, 1);
  emitter.emit("chat:delete", { id });
  return true;
}

export function addChatReaction(postId: string, reaction: string): ChatMessage | null {
  const msg = chatMessages.find((m) => m.id === postId);
  if (!msg) return null;
  msg.reactions[reaction] = (msg.reactions[reaction] || 0) + 1;
  emitter.emit("chat:reaction", { postId, reaction, count: msg.reactions[reaction] });
  return msg;
}

// --- Live API ---

export function connectLive(clientId: string) {
  liveClients.set(clientId, true);
  emitter.emit("live:presence", { viewerCount: liveClients.size });
}

let broadcasterDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function disconnectLive(clientId: string) {
  liveClients.delete(clientId);
  // If the broadcaster disconnects, give 15s grace for SSE reconnect before stopping
  if (clientId === broadcasterId) {
    broadcasterId = null;
    if (liveStreamStatus.isLive) {
      broadcasterDisconnectTimer = setTimeout(() => {
        // Only stop if no new broadcaster has reconnected
        if (!broadcasterId && liveStreamStatus.isLive) {
          console.log("[SSE] Broadcaster disconnected for 15s — auto-stopping live (type:", liveStreamStatus.streamType, ")");
          setLiveStatus(false);
        }
        broadcasterDisconnectTimer = null;
      }, 15000);
    }
  }
  // If a co-host disconnects, remove them
  if (coHostIds.has(clientId)) {
    coHostIds.delete(clientId);
    emitter.emit("live:co-hosts", { coHostIds: Array.from(coHostIds) });
  }
  emitter.emit("live:presence", { viewerCount: liveClients.size });
}

export function getLiveState() {
  return {
    messages: liveChatMessages,
    viewerCount: liveClients.size,
    status: liveStreamStatus,
    coHostIds: Array.from(coHostIds),
  };
}

// Cloudflare WHEP playback URL (for the WHEP proxy to use)
let cloudflareWhepUrl: string | null = null;

export function setCloudflareWhepUrl(url: string | null) {
  cloudflareWhepUrl = url;
}

export function getCloudflareWhepUrl(): string | null {
  return cloudflareWhepUrl;
}

export function addLiveChatMessage(
  author: string,
  content: string,
  isDJ: boolean,
): LiveChatMessage {
  const msg: LiveChatMessage = {
    id: crypto.randomUUID(),
    author,
    content,
    timestamp: new Date().toISOString(),
    isDJ,
  };
  liveChatMessages.push(msg);
  if (liveChatMessages.length > 50) liveChatMessages = liveChatMessages.slice(-50);
  emitter.emit("live:message", msg);
  return msg;
}

export function setLiveStatus(isLive: boolean, streamUrl?: string, streamType?: "hls" | "webrtc" | "whep", location?: { lat: number; lng: number }, venue?: string) {
  if (isLive) {
    liveStreamStatus = {
      isLive: true,
      streamUrl: streamUrl || null,
      streamType: streamType || (streamUrl ? "hls" : "webrtc"),
      currentTrack: liveStreamStatus.currentTrack,
      startedAt: new Date().toISOString(),
      location: location || undefined,
      venue: venue || undefined,
    };
    liveChatMessages = [];
    // Keep existing co-host code (pre-generated) or create a new one
    if (!coHostCode) {
      coHostCode = crypto.randomUUID().slice(0, 6).toUpperCase();
    }
  } else {
    liveStreamStatus = {
      isLive: false,
      streamUrl: null,
      streamType: null,
      currentTrack: null,
      startedAt: null,
    };
    broadcasterId = null;
    coHostIds.clear();
    coHostCode = null;
    cloudflareStreamUid = null;
    cloudflareWhepUrl = null;
  }
  emitter.emit("live:status", liveStreamStatus);
}

export function updateLocation(location?: { lat: number; lng: number }, venue?: string) {
  if (liveStreamStatus.isLive) {
    if (location) liveStreamStatus.location = location;
    if (venue) liveStreamStatus.venue = venue;
    emitter.emit("live:status", liveStreamStatus);
  }
}

export function getCoHostCode(): string | null {
  return coHostCode;
}

// Generate a co-host code if one doesn't exist yet (call before live starts)
export function ensureCoHostCode(): string {
  if (!coHostCode) {
    coHostCode = crypto.randomUUID().slice(0, 6).toUpperCase();
  }
  return coHostCode;
}

export function validateCoHostCode(code: string): boolean {
  return coHostCode !== null && code.toUpperCase() === coHostCode;
}

export function updateCurrentTrack(artist: string, title: string) {
  liveStreamStatus = {
    ...liveStreamStatus,
    currentTrack: { artist, title },
  };
  emitter.emit("live:track", liveStreamStatus.currentTrack);
}

// --- WebRTC Signaling ---

export function setBroadcaster(clientId: string) {
  broadcasterId = clientId;
  // Cancel disconnect timer if broadcaster reconnected
  if (broadcasterDisconnectTimer) {
    clearTimeout(broadcasterDisconnectTimer);
    broadcasterDisconnectTimer = null;
  }
}

export function getBroadcaster() {
  return broadcasterId;
}

export function addCoHost(clientId: string): boolean {
  if (coHostIds.size >= MAX_CO_HOSTS) return false;
  coHostIds.add(clientId);
  emitter.emit("live:co-hosts", { coHostIds: Array.from(coHostIds) });
  return true;
}

export function removeCoHost(clientId: string) {
  coHostIds.delete(clientId);
  emitter.emit("live:co-hosts", { coHostIds: Array.from(coHostIds) });
}

export function getCoHosts(): string[] {
  return Array.from(coHostIds);
}

export function isBroadcasterOrCoHost(clientId: string): boolean {
  return clientId === broadcasterId || coHostIds.has(clientId);
}

export interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "viewer-join" | "viewer-leave" | "guest-ready" | "guest-disconnect" | "co-host-join";
  from: string;
  to?: string;
  data: unknown;
}

export function relaySignal(signal: SignalMessage) {
  emitter.emit("live:signal", signal);
}

// --- Viewer invite ---

export function getRandomViewer(excludeId?: string): string | null {
  const candidates = Array.from(liveClients.keys()).filter(
    (id) => id !== broadcasterId && !coHostIds.has(id) && id !== excludeId,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function sendInvite(viewerId: string, inviteId: string, broadcasterId?: string) {
  emitter.emit("live:invite", { inviteId, viewerId, broadcasterId });
}

export function sendInviteResponse(inviteId: string, viewerId: string, accepted: boolean) {
  emitter.emit("live:invite-response", { inviteId, viewerId, accepted });
}

// --- Scheduled Live broadcast ---

export function emitScheduledLive(data: { date: string; venue: string; city: string; flyerUrl?: string } | null) {
  emitter.emit("live:scheduled", data);
}

// --- SSE subscription helpers ---

export function onChat(
  event: string,
  handler: (...args: unknown[]) => void,
) {
  emitter.on(`chat:${event}`, handler);
  return () => {
    emitter.off(`chat:${event}`, handler);
  };
}

export function onLive(
  event: string,
  handler: (...args: unknown[]) => void,
) {
  emitter.on(`live:${event}`, handler);
  return () => {
    emitter.off(`live:${event}`, handler);
  };
}
