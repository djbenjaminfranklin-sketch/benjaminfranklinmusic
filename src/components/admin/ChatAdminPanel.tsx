"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, Send } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import PostCard from "@/components/fan-zone/PostCard";

export default function ChatAdminPanel() {
  const t = useTranslations("admin");
  const config = useSiteConfig();
  const {
    messages,
    onlineCount,
    isConnected,
    sendMessage,
    addReaction,
    uploadImage,
    uploadAudio,
    uploadVideo,
    deleteMessage,
  } = useChat();

  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    await sendMessage(
      config.artist.name,
      content,
      config.fanZone.djPassword,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("audio/")) {
      await uploadAudio(file, file.name, config.artist.name, config.fanZone.djPassword);
    } else if (file.type.startsWith("video/")) {
      await uploadVideo(file, file.name, config.artist.name, config.fanZone.djPassword);
    } else {
      await uploadImage(file, config.artist.name, undefined, config.fanZone.djPassword);
    }
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDelete = (messageId: string) => {
    deleteMessage(messageId);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t("chatPanel")}
        </h2>
        <div className="flex items-center gap-4">
          {/* Online count */}
          <span className="text-sm text-foreground/60">
            {onlineCount} {t("online")}
          </span>
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs text-foreground/40">
              {isConnected ? t("connected") : t("disconnected")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.map((msg) => (
          <PostCard
            key={msg.id}
            post={msg}
            onReaction={addReaction}
            onDelete={handleDelete}
            variant="admin"
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-border flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("typeMessage")}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-foreground/30 focus:outline-none focus:border-accent"
        />

        {/* Hidden file input for image/audio upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center h-9 w-9 rounded-lg border border-border text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="bg-accent text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          <Send className="h-4 w-4" />
          {t("send")}
        </button>
      </div>
    </div>
  );
}
