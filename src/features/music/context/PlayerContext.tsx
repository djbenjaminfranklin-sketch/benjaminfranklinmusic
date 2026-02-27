"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export interface Track {
  src: string;
  title: string;
  coverUrl: string;
}

interface PlayerState {
  track: Track | null;
  playing: boolean;
  progress: number;
  duration: number;
  currentTime: number;
  queue: Track[];
}

interface PlayerActions {
  playTrack: (src: string, title: string, coverUrl: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  dismiss: () => void;
  setQueue: (tracks: Track[]) => void;
  playNext: () => void;
  playPrev: () => void;
}

type PlayerContextValue = PlayerState & PlayerActions;

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [queue, setQueueState] = useState<Track[]>([]);

  // Refs for callbacks used in event listeners (avoid stale closures)
  const playNextRef = useRef<() => void>(() => {});
  const playPrevRef = useRef<() => void>(() => {});

  // Create audio element on the client
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoaded = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => playNextRef.current();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, []);

  // MediaSession API for lock screen controls
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: "Benjamin Franklin",
      artwork: [
        { src: track.coverUrl, sizes: "512x512", type: "image/jpeg" },
      ],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play();
      setPlaying(true);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (audioRef.current && details.seekTime != null) {
        audioRef.current.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () =>
      playNextRef.current()
    );
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      playPrevRef.current()
    );

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekto", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, [track]);

  const playTrack = useCallback(
    (src: string, title: string, coverUrl: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      const isSameTrack = track?.src === src;

      if (isSameTrack) {
        if (playing) {
          audio.pause();
          setPlaying(false);
        } else {
          audio.play().catch(() => {});
          setPlaying(true);
        }
        return;
      }

      setTrack({ src, title, coverUrl });
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      audio.src = src;
      audio.load();
      audio.play().catch(() => {});
      setPlaying(true);
    },
    [track, playing]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    setPlaying(true);
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const dismiss = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setTrack(null);
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const setQueue = useCallback((tracks: Track[]) => {
    setQueueState(tracks);
  }, []);

  const playNext = useCallback(() => {
    if (!track) return;

    if (queue.length > 0) {
      const idx = queue.findIndex((t) => t.src === track.src);
      if (idx !== -1 && idx < queue.length - 1) {
        const next = queue[idx + 1];
        playTrack(next.src, next.title, next.coverUrl);
        return;
      }
    }

    // No next track — stop
    setPlaying(false);
  }, [queue, track, playTrack]);

  const playPrev = useCallback(() => {
    if (!track) return;
    const audio = audioRef.current;

    // If more than 3s in, restart current track
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    // Try previous track in queue
    if (queue.length > 0) {
      const idx = queue.findIndex((t) => t.src === track.src);
      if (idx > 0) {
        const prev = queue[idx - 1];
        playTrack(prev.src, prev.title, prev.coverUrl);
        return;
      }
    }

    // Default: restart current track
    if (audio) audio.currentTime = 0;
  }, [queue, track, playTrack]);

  // Keep refs in sync for event listeners
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);
  useEffect(() => {
    playPrevRef.current = playPrev;
  }, [playPrev]);

  return (
    <PlayerContext.Provider
      value={{
        track,
        playing,
        progress,
        duration,
        currentTime,
        queue,
        playTrack,
        pause,
        resume,
        seek,
        dismiss,
        setQueue,
        playNext,
        playPrev,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
