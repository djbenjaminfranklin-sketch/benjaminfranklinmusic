"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/features/auth/context/AuthContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  sentAt: string;
}

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function dismissAll() {
    setNotifications([]);
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "all" }),
    });
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return t("justNow");
    if (diffMin < 60) return `${diffMin}min`;
    if (diffH < 24) return `${diffH}h`;
    return date.toLocaleDateString();
  }

  return (
    <div className="min-h-screen bg-background pt-40 pb-20 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-primary">
            {t("title")}
          </h1>
          {notifications.length > 0 && (
            <button
              onClick={dismissAll}
              className="flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("clearAll")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <div className="text-center py-12 text-foreground/40 text-sm">
            Sign in to see notifications
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <BellOff className="h-12 w-12 text-foreground/15" />
            <p className="text-foreground/40 font-medium">{t("empty")}</p>
            <p className="text-foreground/25 text-sm">{t("emptyDesc")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="group rounded-2xl border border-border/50 bg-card/50 p-4 relative"
              >
                <button
                  onClick={() => dismiss(n.id)}
                  className="absolute top-3 right-3 p-1 rounded-full text-foreground/20 hover:text-foreground/50 hover:bg-foreground/5 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-3 pr-6">
                  <div className="mt-0.5 shrink-0 h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-primary text-sm truncate">
                        {n.title}
                      </h3>
                      <span className="text-[11px] text-foreground/30 shrink-0">
                        {formatDate(n.sentAt)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/60 mt-1 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
