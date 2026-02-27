"use client";

import { useState, useEffect } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/features/auth/context/AuthContext";

interface PostFormProps {
  onSubmit: (author: string, content: string, djPassword?: string) => Promise<void>;
}

export default function PostForm({ onSubmit }: PostFormProps) {
  const { user } = useAuth();
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [djPassword, setDjPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("postForm");

  useEffect(() => {
    if (user?.name && !author) {
      setAuthor(user.name);
    }
  }, [user, author]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(author.trim(), content.trim(), djPassword || undefined);
      setContent("");
      setDjPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sticky bottom-0 bg-black/50 backdrop-blur-xl border-t border-white/10 p-4">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={t("nickname")}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={cn(
              "w-40 shrink-0 rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-sm text-white",
              "placeholder:text-white/30 transition-colors",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30",
            )}
          />
          <input
            type="password"
            placeholder={t("djPasswordOptional")}
            value={djPassword}
            onChange={(e) => setDjPassword(e.target.value)}
            className={cn(
              "w-44 shrink-0 rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-sm text-white",
              "placeholder:text-white/30 transition-colors",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30",
            )}
          />
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={t("writeMessage")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={cn(
              "flex-1 rounded-lg bg-white/[0.07] border border-white/10 px-4 py-2.5 text-sm text-white",
              "placeholder:text-white/30 transition-colors",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30",
            )}
          />
          <button
            type="submit"
            disabled={!author.trim() || !content.trim() || isSubmitting}
            className={cn(
              "inline-flex items-center justify-center rounded-lg bg-accent text-background px-4 py-2.5",
              "font-medium text-sm transition-all active:scale-[0.97]",
              "disabled:opacity-50 disabled:pointer-events-none",
              "hover:bg-accent/90",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
