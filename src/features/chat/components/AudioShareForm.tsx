"use client";

import { useState, useRef } from "react";
import { Upload, X, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";

interface AudioShareFormProps {
  onUpload: (file: File, title: string, author: string, djPassword: string) => Promise<void>;
  onClose: () => void;
}

export default function AudioShareForm({ onUpload, onClose }: AudioShareFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [djPassword, setDjPassword] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("audioShare");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim() || !author.trim() || !djPassword || isUploading) return;

    setIsUploading(true);
    setError("");
    try {
      await onUpload(file, title.trim(), author.trim(), djPassword);
      setFile(null);
      setTitle("");
      setAuthor("");
      setDjPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl bg-card border border-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Music className="h-4 w-4 text-accent" />
          {t("shareSound")}
        </div>
        <button type="button" onClick={onClose} className="text-foreground/40 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 cursor-pointer transition-colors",
          "hover:border-accent/40 hover:bg-accent/5",
          file && "border-accent/30 bg-accent/5",
        )}
      >
        <Upload className="h-4 w-4 text-foreground/40" />
        <span className="text-sm text-foreground/60">
          {file ? file.name : t("chooseFile")}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder={t("soundTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
        <input
          type="text"
          placeholder={t("nickname")}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
      </div>

      <input
        type="password"
        placeholder={t("djPassword")}
        value={djPassword}
        onChange={(e) => setDjPassword(e.target.value)}
        className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
      />

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={!file || !title.trim() || !author.trim() || !djPassword || isUploading}
        className={cn(
          "w-full rounded-lg bg-accent text-background py-2.5 text-sm font-medium transition-all",
          "disabled:opacity-50 disabled:pointer-events-none",
          "hover:bg-accent/90 active:scale-[0.98]",
        )}
      >
        {isUploading ? t("uploading") : t("share")}
      </button>
    </form>
  );
}
