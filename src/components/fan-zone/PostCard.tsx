"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "next-intl";
import { PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import type { ChatMessage } from "@/types";
import AudioPlayer from "@/components/music/AudioPlayer";

const REACTION_EMOJIS: Record<string, string> = {
  heart: "\u2764\uFE0F",
  fire: "\uD83D\uDD25",
  "100": "\uD83D\uDCAF",
  headphones: "\uD83C\uDFA7",
  vinyl: "\uD83D\uDCBF",
};

const REACTION_ORDER = ["heart", "fire", "100", "headphones", "vinyl"];

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-blue-500",
  "bg-orange-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ── Broadcast reactions (compact pills) ── */

function BroadcastReactions({
  post,
  onReaction,
}: {
  post: ChatMessage;
  onReaction: (postId: string, reaction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const sorted = REACTION_ORDER
    .filter((r) => (post.reactions[r] || 0) > 0)
    .sort((a, b) => (post.reactions[b] || 0) - (post.reactions[a] || 0));

  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const restCount = rest.reduce((sum, r) => sum + (post.reactions[r] || 0), 0);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 relative">
      {top3.map((reaction) => (
        <motion.button
          key={reaction}
          whileTap={{ scale: 1.3 }}
          onClick={() => onReaction(post.id, reaction)}
          className="inline-flex items-center gap-1 rounded-full bg-white/[0.12] text-white hover:bg-white/[0.18] px-2.5 py-1 text-xs transition-colors"
        >
          <span className="text-sm">{REACTION_EMOJIS[reaction]}</span>
          <span className="font-medium">{post.reactions[reaction]}</span>
        </motion.button>
      ))}

      {restCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-white/50">
          +{restCount}
        </span>
      )}

      {/* Add reaction button */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-white/[0.06] text-white/40 hover:bg-white/[0.12] hover:text-white/70 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 px-2 py-1.5 z-20"
            >
              {REACTION_ORDER.map((reaction) => (
                <button
                  key={reaction}
                  onClick={() => {
                    onReaction(post.id, reaction);
                    setOpen(false);
                  }}
                  className="text-lg hover:scale-125 transition-transform px-1"
                >
                  {REACTION_EMOJIS[reaction]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Admin reactions (all 5 always visible) ── */

function AdminReactions({
  post,
  onReaction,
}: {
  post: ChatMessage;
  onReaction: (postId: string, reaction: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {REACTION_ORDER.map((reaction) => {
        const count = post.reactions[reaction] || 0;
        return (
          <motion.button
            key={reaction}
            whileTap={{ scale: 1.3 }}
            onClick={() => onReaction(post.id, reaction)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors",
              count > 0
                ? "bg-white/[0.12] text-white hover:bg-white/[0.18]"
                : "bg-white/[0.05] text-white/40 hover:bg-white/[0.10] hover:text-white/60",
            )}
          >
            <span className="text-base">{REACTION_EMOJIS[reaction]}</span>
            <span>{count}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ── PostCard ── */

interface PostCardProps {
  post: ChatMessage;
  onReaction: (postId: string, reaction: string) => void;
  onDelete?: (postId: string) => void;
  variant?: "admin" | "broadcast";
}

export default function PostCard({ post, onReaction, onDelete, variant = "admin" }: PostCardProps) {
  const locale = useLocale();
  const config = useSiteConfig();

  const showDJAvatar = post.isDJ && variant === "broadcast";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/[0.06] p-4"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {showDJAvatar ? (
          <div className="relative h-9 w-9 shrink-0 rounded-full overflow-hidden ring-2 ring-amber-500/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.assets.avatar}
              alt={post.author}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
              getAvatarColor(post.author),
            )}
          >
            {post.author.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white truncate">
              {post.author}
            </span>
            {post.isDJ && (
              <span className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                DJ
              </span>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(post.id)}
                className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                title="Delete"
              >
                <span className="text-lg font-bold leading-none">&times;</span>
              </button>
            )}
          </div>
          <span className="text-xs text-white/40">
            {timeAgo(post.timestamp, locale)}
          </span>
          {post.content && (
            <p className="mt-1.5 text-sm text-white/80 whitespace-pre-wrap break-words">
              {post.content}
            </p>
          )}

          {post.imageUrl && (
            <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.06] max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.imageUrl}
                alt={post.imageCaption || "Shared image"}
                className="w-full h-auto object-cover"
              />
              {post.imageCaption && (
                <p className="text-xs text-white/50 p-2">{post.imageCaption}</p>
              )}
            </div>
          )}

          {post.audioUrl && (
            <div className="mt-3 rounded-lg bg-black/30 border border-white/[0.06] p-3">
              <AudioPlayer
                src={post.audioUrl}
                title={post.audioTitle || "Audio"}
              />
            </div>
          )}

          {post.videoUrl && (
            <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.06] max-w-sm">
              <video
                src={post.videoUrl}
                controls
                preload="metadata"
                className="w-full h-auto"
              />
              {post.videoCaption && (
                <p className="text-xs text-white/50 p-2">{post.videoCaption}</p>
              )}
            </div>
          )}

          {variant === "broadcast" ? (
            <BroadcastReactions post={post} onReaction={onReaction} />
          ) : (
            <AdminReactions post={post} onReaction={onReaction} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
