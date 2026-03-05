"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { LiveChatMessage } from "@/shared/types";

interface LiveChatOverlayProps {
  messages: LiveChatMessage[];
  onSend: (author: string, content: string, djPassword?: string) => Promise<void>;
}

export default function LiveChatOverlay({ messages, onSend }: LiveChatOverlayProps) {
  const { user } = useAuth();
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const tPost = useTranslations("postForm");
  const t = useTranslations("live");

  useEffect(() => {
    if (user?.name && !author) {
      setAuthor(user.name);
    }
  }, [user, author]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Auto-fade: hide each message after 8 seconds
  useEffect(() => {
    if (messages.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const msg of messages) {
      if (hiddenIds.has(msg.id)) continue;
      const timer = setTimeout(() => {
        setHiddenIds((prev) => new Set(prev).add(msg.id));
      }, 8000);
      timers.push(timer);
    }
    return () => timers.forEach(clearTimeout);
  }, [messages, hiddenIds]);

  // Cleanup old hidden IDs to avoid memory buildup
  useEffect(() => {
    if (hiddenIds.size > 100) {
      setHiddenIds(new Set());
    }
  }, [hiddenIds.size]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = author.trim() || user?.name || "";
    if (!name || !content.trim() || sending) return;

    setSending(true);
    try {
      await onSend(name, content.trim());
      setContent("");
    } finally {
      setSending(false);
    }
  };

  // N'afficher que les 5 derniers messages visibles
  const visibleMessages = messages.slice(-10).filter((msg) => !hiddenIds.has(msg.id)).slice(-5);

  return (
    <div className="absolute inset-0 flex flex-col justify-end pointer-events-none z-20">
      {/* Gradient en bas pour lisibilité */}
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

      {/* Messages défilants */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-4 pb-2 flex flex-col justify-end min-h-0 max-h-[30%]"
      >
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visibleMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.5 } }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-1.5"
              >
                <div className="rounded-lg bg-black/40 backdrop-blur-sm px-2.5 py-1 max-w-[80%]">
                  <span
                    className={cn(
                      "text-xs font-bold mr-1.5",
                      msg.isDJ ? "text-accent" : "text-white/90",
                    )}
                  >
                    {msg.author}
                    {msg.isDJ && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-accent/30 px-1 py-0.5 text-[8px] font-bold text-accent">
                        {t("djBadge")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-white/70 break-words">{msg.content}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Formulaire d'envoi */}
      <form
        onSubmit={handleSubmit}
        className="relative px-4 pb-4 pt-2 pointer-events-auto"
      >
        {showNameInput && (
          <div className="mb-2">
            <input
              type="text"
              placeholder={tPost("nickname")}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-48 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Bouton pseudo */}
          <button
            type="button"
            onClick={() => setShowNameInput((v) => !v)}
            className={cn(
              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              author
                ? "bg-accent/30 text-accent border border-accent/30"
                : "bg-white/10 text-white/50 border border-white/10",
            )}
          >
            {author ? author[0].toUpperCase() : "?"}
          </button>

          {/* Input message */}
          <input
            type="text"
            placeholder={tPost("sendMessage")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />

          {/* Bouton envoyer */}
          <button
            type="submit"
            disabled={!content.trim() || sending}
            className="shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center disabled:opacity-30 hover:bg-accent/90 transition-colors"
          >
            <Send className="h-3.5 w-3.5 text-background" />
          </button>
        </div>
      </form>
    </div>
  );
}
