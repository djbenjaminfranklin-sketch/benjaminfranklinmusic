"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "@/shared/types";

interface ChatState {
  messages: ChatMessage[];
  onlineCount: number;
  isConnected: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const retryRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const es = new EventSource("/api/chat/stream");
      esRef.current = es;

      es.addEventListener("init", (e) => {
        const data = JSON.parse(e.data) as ChatState;
        setMessages(data.messages);
        setOnlineCount(data.onlineCount);
        setIsConnected(true);
        retryRef.current = 1000;
      });

      es.addEventListener("message", (e) => {
        const msg = JSON.parse(e.data) as ChatMessage;
        setMessages((prev) => {
          const next = [...prev, msg];
          return next.length > 100 ? next.slice(-100) : next;
        });
      });

      es.addEventListener("reaction", (e) => {
        const { postId, reaction, count } = JSON.parse(e.data);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === postId
              ? { ...m, reactions: { ...m.reactions, [reaction]: count } }
              : m,
          ),
        );
      });

      es.addEventListener("presence", (e) => {
        const { onlineCount: count } = JSON.parse(e.data);
        setOnlineCount(count);
      });

      es.addEventListener("delete", (e) => {
        const { id } = JSON.parse(e.data);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      });

      es.onerror = () => {
        es.close();
        setIsConnected(false);
        if (!cancelled) {
          const delay = retryRef.current;
          retryRef.current = Math.min(delay * 2, 30000);
          setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      setIsConnected(false);
    };
  }, []);

  const sendMessage = useCallback(
    async (author: string, content: string, djPassword?: string) => {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, content, djPassword }),
      });
    },
    [],
  );

  const addReaction = useCallback(
    async (postId: string, reaction: string) => {
      await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, reaction }),
      });
    },
    [],
  );

  const uploadAudio = useCallback(
    async (file: File, title: string, author: string, djPassword: string) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("author", author);
      formData.append("djPassword", djPassword);
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
    },
    [],
  );

  const uploadImage = useCallback(
    async (file: File, author: string, caption?: string, djPassword?: string) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("author", author);
      if (caption) formData.append("caption", caption);
      if (djPassword) formData.append("djPassword", djPassword);
      const res = await fetch("/api/chat/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
    },
    [],
  );

  const uploadVideo = useCallback(
    async (file: File, title: string, author: string, djPassword: string) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("author", author);
      formData.append("djPassword", djPassword);
      const res = await fetch("/api/chat/upload-video", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
    },
    [],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/admin/chat/${messageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
    },
    [],
  );

  return { messages, onlineCount, isConnected, sendMessage, addReaction, uploadAudio, uploadImage, uploadVideo, deleteMessage };
}
