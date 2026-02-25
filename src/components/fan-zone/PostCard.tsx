"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
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

interface PostCardProps {
  post: ChatMessage;
  onReaction: (postId: string, reaction: string) => void;
  onDelete?: (postId: string) => void;
}

export default function PostCard({ post, onReaction, onDelete }: PostCardProps) {
  const locale = useLocale();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/[0.06] p-4"
    >
      <div className="flex items-start gap-3">
        {/* Avatar initiale */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
            getAvatarColor(post.author),
          )}
        >
          {post.author.charAt(0).toUpperCase()}
        </div>

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
                className="ml-auto text-xs text-white/30 hover:text-red-400 transition-colors"
              >
                &times;
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
              <Image
                src={post.imageUrl}
                alt={post.imageCaption || "Shared image"}
                width={400}
                height={300}
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
        </div>
      </div>
    </motion.div>
  );
}
