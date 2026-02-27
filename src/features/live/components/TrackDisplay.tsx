"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Music } from "lucide-react";

interface TrackDisplayProps {
  track: { artist: string; title: string } | null;
}

export default function TrackDisplay({ track }: TrackDisplayProps) {
  return (
    <AnimatePresence mode="wait">
      {track && (
        <motion.div
          key={`${track.artist}-${track.title}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-xl bg-black/60 backdrop-blur-sm px-3.5 py-2 border border-white/10"
        >
          <Music className="h-4 w-4 text-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{track.artist}</p>
            <p className="text-xs text-foreground/60 truncate">{track.title}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
