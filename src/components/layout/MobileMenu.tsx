"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, LogOut, Shield, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const socialLabels: Record<string, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export default function MobileMenu({ open, onClose }: MobileMenuProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tHeader = useTranslations("header");
  const tAuth = useTranslations("auth");
  const { user, logout, deleteAccount } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const config = useSiteConfig();

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl"
        >
          {/* Close button */}
          <div className="flex justify-end p-4">
            <button
              onClick={onClose}
              className="p-2 text-foreground/60 hover:text-foreground transition-colors"
              aria-label={tHeader("closeMenu")}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation links */}
          <nav className="flex flex-col items-center gap-2 px-8 mt-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link
                href="/"
                onClick={onClose}
                className={cn(
                  "block px-4 py-3 text-2xl font-bold transition-colors",
                  pathname === "/"
                    ? "text-accent"
                    : "text-foreground/60 hover:text-foreground",
                )}
              >
                {t("home")}
              </Link>
            </motion.div>

            {[...config.navigation.map((n) => ({ key: n.key, href: n.href })), { key: "live" as const, href: "/live" }].map((item, i) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
              >
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "block px-4 py-3 text-2xl font-bold transition-colors",
                    pathname === item.href
                      ? "text-accent"
                      : "text-foreground/60 hover:text-foreground",
                  )}
                >
                  {item.key === "live" ? (
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                      </span>
                      {t("live")}
                    </span>
                  ) : t(item.key)}
                </Link>
              </motion.div>
            ))}
          </nav>

          {/* Admin panel button — right after nav, before user info */}
          {user?.role === "admin" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35 }}
              className="flex justify-center mt-6"
            >
              <Link
                href="/admin"
                onClick={onClose}
                className="flex items-center gap-2 rounded-full bg-accent text-background px-6 py-3 text-sm font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors"
              >
                <Shield className="h-4 w-4" />
                {tAuth("adminPanel")}
              </Link>
            </motion.div>
          )}

          {/* Auth section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center gap-2 mt-6"
          >
            {user ? (
              <>
                <div className="flex items-center gap-2 text-foreground/60">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">{user.name}</span>
                </div>
                <button
                  onClick={() => { logout(); onClose(); }}
                  className="flex items-center gap-2 text-sm text-foreground/40 hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {tAuth("logout")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 mt-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {tAuth("deleteAccount")}
                </button>
              </>
            ) : (
              <button
                onClick={() => { onClose(); setShowAuthModal(true); }}
                className="px-6 py-2.5 rounded-lg bg-accent text-background text-sm font-semibold hover:bg-accent/90 transition-colors"
              >
                {tAuth("signIn")}
              </button>
            )}
          </motion.div>

          {/* Legal + Socials */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-4">
              <Link
                href="/terms"
                onClick={onClose}
                className="text-xs text-foreground/40 hover:text-accent transition-colors"
              >
                {tAuth("termsOfService")}
              </Link>
              <Link
                href="/privacy"
                onClick={onClose}
                className="text-xs text-foreground/40 hover:text-accent transition-colors"
              >
                {tAuth("privacyPolicy")}
              </Link>
            </div>
            <div className="flex items-center gap-6">
              {Object.entries(config.socials).map(
                ([key, url]) =>
                  url && (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground/40 hover:text-accent transition-colors"
                    >
                      {socialLabels[key] || key}
                    </a>
                  ),
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {showAuthModal && (
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    )}
    {/* Delete account confirmation dialog */}
    <AnimatePresence>
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-primary text-center mb-2">{tAuth("confirmDelete")}</h3>
            <p className="text-sm text-foreground/60 text-center mb-6">{tAuth("deleteWarning")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-foreground/10 text-foreground/60 hover:bg-foreground/15 transition-colors"
              >
                {tAuth("cancel")}
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteAccount();
                    onClose();
                  } catch {
                    // error handled by context
                  } finally {
                    setDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={deleting}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? "..." : tAuth("confirmDelete")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
