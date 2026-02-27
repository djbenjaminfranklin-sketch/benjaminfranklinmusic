"use client";

import { motion } from "framer-motion";
import { Music2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSiteConfig } from "@/shared/contexts/SiteConfigContext";
import Badge from "@/shared/ui/Badge";
import ReleaseCard from "./ReleaseCard";
import type { Release } from "@/shared/types";

interface MusicContainerProps {
  releases?: Release[];
}

export default function MusicContainer({ releases: releasesProp }: MusicContainerProps) {
  const t = useTranslations("music");
  const config = useSiteConfig();
  const releases = releasesProp || [];

  return (
    <section className="relative min-h-screen bg-background pt-40 sm:pt-24 pb-16 overflow-hidden">
      {/* Subtle background photo */}
      <div className="absolute top-0 right-0 w-1/2 h-[600px] opacity-[0.04]">
        <Image
          src={config.assets.heroImage}
          alt=""
          fill
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h1 className="text-4xl sm:text-5xl font-bold text-primary">{t("title")}</h1>
          <p className="text-foreground/50 mt-2 text-lg">{config.artist.name}</p>
        </motion.div>

        {/* Productions banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative mb-16 rounded-2xl overflow-hidden border border-border h-[220px] sm:h-[260px]"
        >
          <Image
            src={config.assets.avatar}
            alt=""
            fill
            className="object-cover object-top opacity-25"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          <div className="relative flex flex-col justify-center h-full px-8 sm:px-12">
            <Badge variant="accent" className="w-fit mb-3">
              {t("releasesCount", { count: releases.length })}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">
              {t("productions")}
            </h2>
            <p className="text-foreground/40 mt-2 max-w-md text-sm">
              {t("productionsSubtitle")}
            </p>
          </div>
        </motion.div>

        {/* All releases grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-primary mb-6">{t("allReleases")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {releases.map((release, i) => (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
              >
                <ReleaseCard release={release} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Follow on Spotify */}
        {config.socials.spotify && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex justify-center"
          >
            <a
              href={config.socials.spotify}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-full bg-accent/10 border border-accent/20 px-6 py-3 text-accent font-medium hover:bg-accent/20 transition-colors"
            >
              <Music2 className="w-5 h-5" />
              {t("followOnSpotify")}
            </a>
          </motion.div>
        )}
      </div>
    </section>
  );
}
