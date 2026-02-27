"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, Megaphone, Radio, Settings, Calendar, Music, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import PullToRefresh from "@/components/PullToRefresh";

const navItems = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "users", href: "/admin/users", icon: Users },
  { key: "broadcast", href: "/admin/broadcast", icon: Megaphone },
  { key: "liveControls", href: "/admin/live", icon: Radio },
  { key: "settings", href: "/admin/settings", icon: Settings },
  { key: "shows", href: "/admin/shows", icon: Calendar },
  { key: "releases", href: "/admin/releases", icon: Music },
  { key: "chatPanel", href: "/admin/chat", icon: MessageSquare },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("admin");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== "admin") {
        router.replace("/");
      } else {
        setReady(true);
      }
    }
  }, [user, loading, router]);

  if (loading || !ready) {
    return (
      <div className="min-h-screen bg-background pt-40 sm:pt-24 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-40 sm:pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <nav className="lg:w-56 shrink-0">
            <div className="lg:sticky lg:top-28 space-y-1">
              <h2 className="text-lg font-bold text-primary mb-4">{t("adminPanel")}</h2>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <PullToRefresh>{children}</PullToRefresh>
          </div>
        </div>
      </div>
    </div>
  );
}
