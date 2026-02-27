"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
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

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="min-h-screen bg-background pt-40 pb-20 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-8 text-center">
          {t("title")}
        </h1>

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
                className="rounded-2xl border border-border/50 bg-card/50 p-4"
              >
                <div className="flex items-start gap-3">
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
