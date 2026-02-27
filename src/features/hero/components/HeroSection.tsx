"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Music, Calendar, Users, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";

const iconMap = {
  Music,
  Calendar,
  Users,
  Radio,
} as const;

const cardImages: Record<string, string> = {
  "/music": "/nav-music.jpg",
  "/shows": "/nav-shows.jpg",
  "/fan-zone": "/nav-fanzone.jpg",
  "/live": "/nav-live.jpg",
};

interface HeroSectionProps {
  taglineOverride?: string | null;
}

export default function HeroSection({ taglineOverride }: HeroSectionProps) {
  const t = useTranslations("nav");
  const tHero = useTranslations("hero");
  const config = useSiteConfig();

  const navItems = [
    ...config.navigation.map((n) => ({
      key: n.key,
      href: n.href,
      icon: n.icon,
    })),
    { key: "live" as const, href: "/live", icon: "Radio" as const },
  ];

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-4 overflow-hidden">
      {/* Background photo */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute"
          role="img"
          aria-label={config.artist.name}
          style={{
            inset: "-20%",
            backgroundImage: `url(${config.assets.heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center center",
            transform: `translate(${(50 - parseFloat(config.assets.heroImagePosX || "50")) * 0.4}%, ${(50 - parseFloat(config.assets.heroImagePosY || "50")) * 0.4}%)`,
          }}
        />
        <div className="absolute inset-0 bg-background/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-background/50" />
      </div>

      {/* Animated glow */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent blur-[150px]"
      />

      <div className="relative z-10 flex flex-col items-center justify-between min-h-screen max-w-4xl mx-auto text-center pt-28 sm:pt-36 pb-28 sm:pb-10">
        {/* Nom artiste */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mt-4 sm:mt-0 border-2 border-white/80 px-4 sm:px-12 py-3 sm:py-5"
        >
          <h1
            className="text-3xl sm:text-6xl lg:text-7xl font-bold uppercase tracking-[0.15em] text-primary"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            {config.artist.name}
          </h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-4 sm:mt-6 text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] uppercase text-accent font-light"
        >
          {taglineOverride || tHero("tagline")}
        </motion.p>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
          className="mt-4 sm:mt-6 mb-auto w-24 h-px bg-accent/40"
        />

        {/* Navigation cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mb-4 sm:mb-0 grid grid-cols-4 gap-2 sm:gap-6 w-full max-w-3xl px-2 sm:px-0"
        >
          {navItems.map((item, i) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1, duration: 0.4 }}
              >
                <Link
                  href={item.href}
                  className="group relative flex flex-col items-center justify-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl p-3 sm:p-6 aspect-square transition-all duration-300 overflow-hidden
                    border border-white/[0.08]
                    hover:border-accent/40 hover:shadow-[0_0_30px_-5px] hover:shadow-accent/20"
                >
                  {/* Background image */}
                  <Image
                    src={cardImages[item.href] || config.assets.heroImage}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    sizes="200px"
                  />
                  <div className="absolute inset-0 bg-black/50 group-hover:bg-black/40 transition-colors duration-300" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-accent/20 to-transparent" />

                  <div className="relative">
                    <Icon className="h-5 w-5 sm:h-7 sm:w-7 text-white/60 group-hover:text-accent transition-all duration-300 group-hover:drop-shadow-[0_0_8px_var(--accent)]" />
                  </div>
                  <span className="relative text-[10px] sm:text-sm font-semibold text-white group-hover:text-accent transition-colors duration-300">
                    {t(item.key)}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 mt-6 sm:mt-8"
        >
          {Object.entries(config.socials).map(
            ([key, url]) =>
              url && (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs tracking-widest uppercase text-foreground/60 hover:text-accent transition-all duration-300 hover:drop-shadow-[0_0_6px_var(--accent)]"
                >
                  {key}
                </a>
              ),
          )}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
