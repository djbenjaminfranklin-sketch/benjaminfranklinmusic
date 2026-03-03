export interface FanZonePost {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  isDJ: boolean;
  reactions: Record<string, number>;
}

export interface ChatMessage extends FanZonePost {
  audioUrl?: string;
  audioTitle?: string;
  imageUrl?: string;
  imageCaption?: string;
  videoUrl?: string;
  videoCaption?: string;
}

export interface LiveChatMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  isDJ: boolean;
}

export interface LiveStreamStatus {
  isLive: boolean;
  streamUrl: string | null;
  streamType: "hls" | "webrtc" | "whep" | null;
  currentTrack: { artist: string; title: string } | null;
  startedAt: string | null;
  location?: { lat: number; lng: number };
  venue?: string;
  broadcastMode?: "multicam" | "director";
}

export interface ViewerInvite {
  inviteId: string;
  viewerId: string;
  status: "pending" | "accepted" | "declined";
}

export interface Show {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  ticketUrl?: string;
  soldOut?: boolean;
}

export interface PastSet {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  tracklist?: string[];
}

export interface Release {
  id: string;
  title: string;
  type: "single" | "ep" | "album" | "remix";
  releaseDate: string;
  coverUrl: string;
  audioUrl?: string;
  spotifyUrl?: string;
  spotifyEmbedId?: string;
  featured?: boolean;
}

// Auth types
export interface User {
  id: string;
  email: string;
  name: string;
  role: "fan" | "admin";
  created_at: string;
  email_verified: number;
  banned: number;
  phone: string | null;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  channels: string[];
  sent_by: string;
  sent_at: string;
  recipient_count: number;
}

export interface PushSubscriptionData {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
