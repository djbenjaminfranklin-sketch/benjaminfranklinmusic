"use client";

import { useEffect, useState } from "react";
import { Download, Users as UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

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
    const header = "Name,Email,Role,Registered";
    const rows = users.map(
      (u) => `"${u.name}","${u.email}","${u.role}","${new Date(u.created_at).toISOString()}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 flex flex-col items-center gap-3">
            <UsersIcon className="h-10 w-10 text-foreground/15" />
            <p className="text-sm text-foreground/30">{t("noUsers")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                    {t("name")}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                    {t("email")}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                    {t("role")}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                    {t("registered")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground/60">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          user.role === "admin"
                            ? "bg-accent/20 text-accent"
                            : "bg-foreground/10 text-foreground/50"
                        )}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground/40">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
