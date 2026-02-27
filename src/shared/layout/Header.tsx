"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Menu, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";
import { cn } from "@/shared/lib/utils";
import MobileMenu from "./MobileMenu";
import LanguageSelector from "./LanguageSelector";
import UserMenu from "@/features/auth/components/UserMenu";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const tHeader = useTranslations("header");
  const config = useSiteConfig();
  const isHome = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-background/80 backdrop-blur-xl border-b border-border/50"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 sm:h-24 max-w-6xl items-center justify-between px-4 sm:px-6 mt-[55px] sm:mt-6">
          <div className="flex items-center gap-2">
            {/* Flèche retour */}
            {!isHome && (
              <button
                onClick={() => router.back()}
                className="shrink-0 p-2 rounded-full text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}

            {/* Logo rond */}
            <Link
              href="/"
              className="shrink-0 transition-transform hover:scale-105"
            >
              <Image
                src={config.assets.logo}
                alt={config.artist.name}
                width={100}
                height={100}
                className="rounded-full w-16 h-16 sm:w-[100px] sm:h-[100px]"
              />
            </Link>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {config.navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "text-accent bg-accent/10"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5",
                )}
              >
                {t(item.key)}
              </Link>
            ))}
            <Link
              href="/live"
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                pathname === "/live"
                  ? "text-accent bg-accent/10"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/5",
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              {t("live")}
            </Link>
            <LanguageSelector />
            <UserMenu />
          </nav>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <LanguageSelector />
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 text-foreground/60 hover:text-foreground transition-colors"
              aria-label={tHeader("openMenu")}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
