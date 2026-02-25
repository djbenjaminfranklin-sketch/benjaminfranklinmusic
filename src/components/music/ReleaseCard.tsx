"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Release } from "@/types";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SpotifyEmbed from "./SpotifyEmbed";
import AudioPlayer from "./AudioPlayer";

interface ReleaseCardProps {
  release: Release;
  className?: string;
}

export default function ReleaseCard({ release, className }: ReleaseCardProps) {
  const t = useTranslations("music");

  const typeLabels: Record<Release["type"], string> = {
    single: t("single"),
    ep: t("ep"),
    album: t("album"),
    remix: t("remix"),
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card hover className={cn("flex flex-col gap-4 p-0 overflow-hidden", className)}>
        {/* Cover image */}
        <div className="relative aspect-square w-full overflow-hidden">
          <Image
            src={release.coverUrl}
            alt={release.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-primary text-lg leading-tight">
                {release.title}
              </h3>
            </div>
            <Badge variant="accent">{typeLabels[release.type]}</Badge>
          </div>

          {/* Audio player */}
          {release.audioUrl && (
            <AudioPlayer src={release.audioUrl} title={release.title} />
          )}

          {/* Spotify embed */}
          {release.spotifyEmbedId && (
            <SpotifyEmbed spotifyEmbedId={release.spotifyEmbedId} />
          )}

          {/* Listen on Spotify link */}
          {release.spotifyUrl && (
            <a
              href={release.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t("listenOnSpotify")}
            </a>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
