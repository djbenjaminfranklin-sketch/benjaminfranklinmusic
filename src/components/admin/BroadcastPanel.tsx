"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Mail, Bell, MessageSquare, Clock, ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  channels: string;
  sent_at: string;
  recipient_count: number;
}

const channelOptions = [
  { key: "email", icon: Mail, label: "emailChannel" },
  { key: "push", icon: Bell, label: "pushChannel" },
  { key: "chat", icon: MessageSquare, label: "chatChannel" },
] as const;

export default function BroadcastPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<string[]>(["chat"]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("admin");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/admin/broadcast");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.broadcasts || []);
      }
    } catch {
      // ignore
    }
  };

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "images");
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setImageUrl(data.url);
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim() || channels.length === 0) return;

    setSending(true);
    setError("");
    setSent(false);

    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, channels, imageUrl: imageUrl || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      setSent(true);
      setTitle("");
      setMessage("");
      setImageUrl("");
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">{t("broadcast")}</h1>

      {/* Compose */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground/60">{t("sendBroadcast")}</h3>

        <div>
          <label className="block text-xs font-medium text-foreground/50 mb-1.5">{t("title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground/50 mb-1.5">{t("message")}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={4}
            className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground/50 mb-2">{t("channels")}</label>
          <div className="flex gap-2">
            {channelOptions.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => toggleChannel(key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                  channels.includes(key)
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-background border-border text-foreground/40 hover:text-foreground/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        {/* Image attachment */}
        <div>
          <label className="block text-xs font-medium text-foreground/50 mb-2">{t("attachment")}</label>
          {imageUrl ? (
            <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border bg-background group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Attachment" className="w-full h-full object-cover" />
              <button
                onClick={() => setImageUrl("")}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/50 hover:text-foreground hover:border-foreground/30 transition-colors",
                  uploadingImage && "opacity-50 pointer-events-none"
                )}
              >
                {uploadingImage ? (
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {t("addImage")}
              </button>
            </>
          )}
        </div>

        {/* Preview */}
        {(title || message || imageUrl) && (
          <div className="rounded-lg border border-border/50 bg-background p-4">
            <p className="text-xs font-medium text-foreground/30 mb-2">{t("preview")}</p>
            {title && <p className="text-sm font-semibold text-primary">{title}</p>}
            {message && <p className="text-sm text-foreground/60 whitespace-pre-wrap mt-1">{message}</p>}
            {imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border/50 max-w-[200px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="w-full h-auto object-cover" />
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {sent && <p className="text-xs text-green-400">{t("sent")}</p>}

        <button
          onClick={handleSend}
          disabled={!title.trim() || !message.trim() || channels.length === 0 || sending}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-accent text-background px-5 py-2.5 text-sm font-semibold",
            "hover:bg-accent/90 transition-colors disabled:opacity-50"
          )}
        >
          <Send className="h-4 w-4" />
          {sending ? t("sending") : t("send")}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground/60 mb-4">{t("history")}</h3>
          <div className="space-y-3">
            {history.map((b) => {
              const parsedChannels: string[] = (() => {
                try { return JSON.parse(b.channels); } catch { return []; }
              })();
              return (
                <div key={b.id} className="flex items-start justify-between p-3 rounded-lg bg-background border border-border/50">
                  <div>
                    <p className="text-sm font-medium text-primary">{b.title}</p>
                    <p className="text-xs text-foreground/40 mt-0.5 line-clamp-1">{b.message}</p>
                    <div className="flex gap-1 mt-1.5">
                      {parsedChannels.map((ch: string) => (
                        <span key={ch} className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/40">
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="flex items-center gap-1 text-xs text-foreground/30">
                      <Clock className="h-3 w-3" />
                      {new Date(b.sent_at).toLocaleString()}
                    </div>
                    <p className="text-xs text-foreground/30 mt-0.5">
                      {t("recipientCount")}: {b.recipient_count}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
