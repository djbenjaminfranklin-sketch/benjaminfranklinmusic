"use client";

import { useState } from "react";
import { User, LogOut, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/features/auth/context/AuthContext";
import AuthModal from "./AuthModal";

export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const t = useTranslations("auth");

  if (loading) return null;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className={cn(
            "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
          )}
        >
          {t("signIn")}
        </button>
        <AuthModal open={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
          <User className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="hidden sm:inline max-w-[100px] truncate">{user.name}</span>
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-card shadow-xl py-1">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-primary truncate">{user.name}</p>
              <p className="text-xs text-foreground/40 truncate">{user.email}</p>
            </div>

            {user.role === "admin" && (
              <Link
                href="/admin"
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <Shield className="h-4 w-4" />
                {t("adminPanel")}
              </Link>
            )}

            <button
              onClick={() => {
                setShowDropdown(false);
                logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("logout")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
