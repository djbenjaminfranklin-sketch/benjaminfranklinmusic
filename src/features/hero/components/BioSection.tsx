"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";

interface BioSectionProps {
  bioOverride?: string | null;
}

export default function BioSection({ bioOverride }: BioSectionProps) {
  const tHero = useTranslations("hero");
  const tArtist = useTranslations("artist");
  const config = useSiteConfig();

  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background subtil */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Titre */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold uppercase tracking-[0.15em] text-primary"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            {tHero("aboutTitle")}
          </h2>
          <div className="mt-4 mx-auto w-16 h-px bg-accent/50" />
        </motion.div>

        {/* Contenu */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          {/* Photo */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <div className="relative aspect-[3/4] w-full max-w-sm mx-auto rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl">
              <Image
                src={config.assets.bioImage}
                alt={config.artist.name}
                fill
                style={{ objectFit: "cover", objectPosition: "var(--bio-image-pos, center 15%)" }}
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
              {/* Accent glow en bas */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent/60" />
            </div>
          </motion.div>

          {/* Texte bio */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-3 space-y-6"
          >
            <p className="text-base sm:text-lg leading-relaxed text-foreground/70">
              {bioOverride || tArtist("bio")}
            </p>

            {/* Liens sociaux stylises */}
            <div className="flex flex-wrap gap-4 pt-4">
              {Object.entries(config.socials).map(
                ([key, url]) =>
                  url && (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs tracking-widest uppercase text-foreground/30 hover:text-accent transition-all duration-300 border border-white/[0.08] rounded-full px-4 py-2 hover:border-accent/40 hover:shadow-[0_0_15px_-5px] hover:shadow-accent/20"
                    >
                      {key}
                    </a>
                  ),
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
