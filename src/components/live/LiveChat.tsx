"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { LiveChatMessage } from "@/types";

interface LiveChatProps {
  messages: LiveChatMessage[];
  onSend: (author: string, content: string, djPassword?: string) => Promise<void>;
}

export default function LiveChat({ messages, onSend }: LiveChatProps) {
  const { user } = useAuth();
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [djPassword, setDjPassword] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("live");
  const tPost = useTranslations("postForm");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !content.trim() || sending) return;

    setSending(true);
    try {
      await onSend(author.trim(), content.trim(), djPassword || undefined);
      setContent("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
        {messages.length === 0 ? (
          <p className="text-foreground/20 text-sm text-center py-8">
            {t("noMessages")}
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "font-semibold shrink-0",
                  msg.isDJ ? "text-accent" : "text-foreground/70",
                )}
              >
                {msg.author}
                {msg.isDJ && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    {t("djBadge")}
                  </span>
                )}
              </span>
              <span className="text-foreground/50 break-words min-w-0">
                {msg.content}
              </span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={tPost("nickname")}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-28 shrink-0 rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder={tPost("djOptional")}
            value={djPassword}
            onChange={(e) => setDjPassword(e.target.value)}
            className="w-24 shrink-0 rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={tPost("sendMessage")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 rounded-lg bg-background border border-border px-3 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!author.trim() || !content.trim() || sending}
            className="shrink-0 rounded-lg bg-accent text-background px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
