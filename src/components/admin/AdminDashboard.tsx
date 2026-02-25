"use client";

import { useEffect, useState } from "react";
import { Users, Megaphone, Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import type { User } from "@/types";

interface Stats {
  userCount: number;
  broadcastCount: number;
  pushSubscriptionCount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const t = useTranslations("admin");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setRecentUsers((data.users || []).slice(0, 5)))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">{t("dashboard")}</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <span className="text-sm font-medium text-foreground/50">{t("totalUsers")}</span>
          </div>
          <p className="text-3xl font-bold text-primary tabular-nums">
            {stats?.userCount ?? "..."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Megaphone className="h-5 w-5 text-accent" />
            </div>
            <span className="text-sm font-medium text-foreground/50">{t("broadcastsSent")}</span>
          </div>
          <p className="text-3xl font-bold text-primary tabular-nums">
            {stats?.broadcastCount ?? "..."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-accent" />
            </div>
            <span className="text-sm font-medium text-foreground/50">{t("pushSubscribers")}</span>
          </div>
          <p className="text-3xl font-bold text-primary tabular-nums">
            {stats?.pushSubscriptionCount ?? "..."}
          </p>
        </div>
      </div>

      {/* Recent users */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground/60 mb-4">{t("recentSignups")}</h3>
        {recentUsers.length === 0 ? (
          <p className="text-sm text-foreground/30">{t("noUsers")}</p>
        ) : (
          <div className="space-y-3">
            {recentUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">{user.name}</p>
                  <p className="text-xs text-foreground/40">{user.email}</p>
                </div>
                <span className="text-xs text-foreground/30">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
