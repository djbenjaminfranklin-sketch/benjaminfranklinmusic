"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";
import { GoogleIcon, AppleIcon } from "./OAuthIcons";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, login, signup } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("auth");
  const config = useSiteConfig();

  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Detect OAuth error from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setError(t("oauthError"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [t]);

  // Allow legal pages and co-host page without auth
  const isPublicPage = pathname.includes("/privacy") || pathname.includes("/terms") || pathname.includes("/live/cohost");
  if (isPublicPage) return <>{children}</>;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-[100]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col items-center justify-center px-4 overflow-y-auto">
      <div className="w-full max-w-md py-8">
        {/* Logo */}
        {config.assets.logo && (
          <img
            src={config.assets.logo}
            alt={config.artist.name}
            className="h-16 mx-auto mb-6 object-contain"
          />
        )}

        <h1 className="text-2xl font-bold text-primary text-center mb-1">
          {t("welcomeTitle")}
        </h1>
        <p className="text-sm text-foreground/50 text-center mb-8">
          {t("welcomeSubtitle")}
        </p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-card border border-border">
          <button
            onClick={() => { setMode("login"); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
              mode === "login"
                ? "bg-background text-primary shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            )}
          >
            {t("signIn")}
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
              mode === "signup"
                ? "bg-background text-primary shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            )}
          >
            {t("signUp")}
          </button>
        </div>

        {/* OAuth buttons */}
        <div className="space-y-3 mb-4">
          <button
            type="button"
            onClick={() => { window.location.href = "/api/auth/apple"; }}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white text-black py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            <AppleIcon />
            {t("continueWithApple")}
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = "/api/auth/google"; }}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-card border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-background transition-colors"
          >
            <GoogleIcon />
            {t("continueWithGoogle")}
          </button>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-foreground/40">{t("or")}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-foreground/60 mb-1.5">
                {t("name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                className="w-full rounded-lg bg-card border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                placeholder={t("namePlaceholder")}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1.5">
              {t("email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg bg-card border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              placeholder={t("emailPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground/60 mb-1.5">
              {t("password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg bg-card border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              placeholder={t("passwordPlaceholder")}
            />
          </div>

          {/* CGU checkbox — signup only */}
          {mode === "signup" && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
              />
              <span className="text-xs text-foreground/60 leading-relaxed">
                {t.rich("acceptTerms", {
                  terms: (chunks) => (
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {chunks}
                    </a>
                  ),
                  privacy: (chunks) => (
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {chunks}
                    </a>
                  ),
                })}
              </span>
            </label>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={formLoading || (mode === "signup" && !acceptedTerms)}
            className={cn(
              "w-full rounded-lg bg-accent text-background py-2.5 text-sm font-semibold",
              "hover:bg-accent/90 transition-colors disabled:opacity-50"
            )}
          >
            {formLoading
              ? "..."
              : mode === "login"
              ? t("signIn")
              : t("signUp")}
          </button>
        </form>
      </div>
    </div>
  );
}
