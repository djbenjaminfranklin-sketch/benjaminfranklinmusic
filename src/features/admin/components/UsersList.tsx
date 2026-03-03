"use client";

import { useEffect, useState } from "react";
import { Download, Users as UsersIcon, Ban, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import type { User } from "@/shared/types";

export default function UsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("admin");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exportCSV = () => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = "Name,Email,Phone,Role,Registered";
    const rows = users.map(
      (u) => `${escape(u.name)},${escape(u.email)},${escape(u.phone || "")},${escape(u.role)},${escape(new Date(u.created_at).toISOString())}`
    );
    const csv = [header, ...rows].join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleBan = async (user: User) => {
    const isBanned = user.banned === 1;
    if (!isBanned && !confirm(t("confirmBan"))) return;
    const method = isBanned ? "DELETE" : "POST";
    const res = await fetch(`/api/admin/users/${user.id}/ban`, { method });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, banned: isBanned ? 0 : 1 } : u
        )
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t("users")}</h1>
          <p className="text-sm text-foreground/40 mt-1">
            {t("totalUsers")}: {total}
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={users.length === 0}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 text-sm font-medium text-accent",
            "hover:bg-accent/20 disabled:opacity-50 transition-colors"
          )}
        >
          <Download className="h-4 w-4" />
          {t("exportCSV")}
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <UsersIcon className="h-10 w-10 text-foreground/15" />
          <p className="text-sm text-foreground/30">{t("noUsers")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-bold text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-primary truncate">{user.name}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      user.role === "admin"
                        ? "bg-accent/20 text-accent"
                        : "bg-foreground/10 text-foreground/50"
                    )}
                  >
                    {user.role}
                  </span>
                  {user.banned === 1 && (
                    <span className="inline-flex items-center rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-[10px] font-medium">
                      {t("banned")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/40 truncate">{user.email}</p>
                {user.phone && (
                  <p className="text-xs text-foreground/40 truncate">{user.phone}</p>
                )}
                <p className="text-xs text-foreground/30 mt-0.5">
                  {t("registered")}: {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Ban button — always visible */}
              {user.role !== "admin" && (
                <button
                  onClick={() => toggleBan(user)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    user.banned === 1
                      ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  )}
                >
                  {user.banned === 1 ? (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      {t("unban")}
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
                      {t("ban")}
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
