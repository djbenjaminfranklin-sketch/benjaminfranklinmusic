"use client";

import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import PostCard from "./PostCard";
import type { ChatMessage } from "@/types";

interface LiveFeedProps {
  posts: ChatMessage[];
  isLoading: boolean;
  onReaction: (postId: string, reaction: string) => void;
  variant?: "admin" | "broadcast";
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-white/[0.07] border border-white/[0.06] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-full bg-white/10" />
            <div className="h-4 w-24 rounded bg-white/10" />
            <div className="h-4 w-16 rounded bg-white/10" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-2/3 rounded bg-white/10" />
          </div>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-7 w-14 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDateSeparator(date: Date, locale: string): string {
  return date
    .toLocaleDateString(locale, { day: "numeric", month: "long" })
    .toUpperCase();
}

function formatDateTimeSeparator(date: Date, locale: string): string {
  const datePart = date
    .toLocaleDateString(locale, { day: "numeric", month: "short" })
    .toUpperCase()
    .replace(".", "");
  const timePart = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} À ${timePart}`;
}

function getDayKey(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function LiveFeed({ posts, isLoading, onReaction, variant = "admin" }: LiveFeedProps) {
  const t = useTranslations("fanZone");
  const locale = useLocale();

  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [posts],
  );

  // Admin mode: group by day
  const grouped = useMemo(() => {
    if (variant === "broadcast") return [];

    const groups: { key: string; label: string; posts: ChatMessage[] }[] = [];
    let currentKey = "";

    for (const post of sorted) {
      const key = getDayKey(post.timestamp);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          key,
          label: formatDateSeparator(new Date(post.timestamp), locale),
          posts: [],
        });
      }
      groups[groups.length - 1].posts.push(post);
    }

    return groups;
  }, [sorted, locale, variant]);

  if (isLoading) return <Skeleton />;

  /* ── Broadcast mode: each message has its own date+time separator ── */
  if (variant === "broadcast") {
    return (
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {sorted.map((post) => (
            <div key={post.id} className="space-y-3">
              {/* Date + time separator per message */}
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] font-semibold tracking-widest text-white/30">
                  {formatDateTimeSeparator(new Date(post.timestamp), locale)}
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <PostCard post={post} onReaction={onReaction} variant="broadcast" />
            </div>
          ))}
        </AnimatePresence>
        {sorted.length === 0 && (
          <p className="text-center text-white/40 py-12 text-sm">
            {t("noMessages")}
          </p>
        )}
      </div>
    );
  }

  /* ── Admin mode: grouped by day ── */
  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.key} className="space-y-4">
          {/* Séparateur de date */}
          <div className="flex items-center gap-3 py-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] font-semibold tracking-widest text-white/30">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <AnimatePresence mode="popLayout">
            {group.posts.map((post) => (
              <PostCard key={post.id} post={post} onReaction={onReaction} variant="admin" />
            ))}
          </AnimatePresence>
        </div>
      ))}
      {grouped.length === 0 && (
        <p className="text-center text-white/40 py-12 text-sm">
          {t("noMessages")}
        </p>
      )}
    </div>
  );
}
