"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const t = useTranslations("auth");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
      setEmail("");
      setPassword("");
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-foreground/40 hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-primary mb-6">
          {mode === "login" ? t("signIn") : t("signUp")}
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-background">
          <button
            onClick={() => { setMode("login"); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
              mode === "login"
                ? "bg-card text-primary shadow-sm"
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
                ? "bg-card text-primary shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            )}
          >
            {t("signUp")}
          </button>
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
                className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
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
              className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
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
              className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              placeholder={t("passwordPlaceholder")}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full rounded-lg bg-accent text-background py-2.5 text-sm font-semibold",
              "hover:bg-accent/90 transition-colors disabled:opacity-50"
            )}
          >
            {loading
              ? "..."
              : mode === "login"
              ? t("signIn")
              : t("signUp")}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-foreground/40">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <button onClick={() => { setMode("signup"); setError(""); }} className="text-accent hover:underline">
                {t("signUp")}
              </button>
            </>
          ) : (
            <>
              {t("hasAccount")}{" "}
              <button onClick={() => { setMode("login"); setError(""); }} className="text-accent hover:underline">
                {t("signIn")}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
