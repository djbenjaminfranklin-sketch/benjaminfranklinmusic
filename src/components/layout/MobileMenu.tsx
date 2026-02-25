"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, LogOut, Shield } from "lucide-react";
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
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
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

          {/* Auth section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex flex-col items-center gap-2 mt-8"
          >
            {user ? (
              <>
                <div className="flex items-center gap-2 text-foreground/60">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">{user.name}</span>
                </div>
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={onClose}
                    className="flex items-center gap-2 text-sm text-accent"
                  >
                    <Shield className="h-4 w-4" />
                    {tAuth("adminPanel")}
                  </Link>
                )}
                <button
                  onClick={() => { logout(); onClose(); }}
                  className="flex items-center gap-2 text-sm text-foreground/40 hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {tAuth("logout")}
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

          {/* Socials */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="absolute bottom-12 left-0 right-0 flex justify-center gap-6"
          >
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {showAuthModal && (
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    )}
    </>
  );
}
