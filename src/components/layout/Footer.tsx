"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSiteConfig } from "@/contexts/SiteConfigContext";

const socialIcons: Record<string, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  soundcloud: "SoundCloud",
  tiktok: "TikTok",
};

export default function Footer() {
  const year = new Date().getFullYear();
  const t = useTranslations("footer");
  const config = useSiteConfig();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Artist info */}
          <div className="text-center sm:text-left">
            <Link href="/" className="text-sm font-bold text-primary hover:text-accent transition-colors">
              {config.artist.name}
            </Link>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-4">
            {Object.entries(config.socials).map(
              ([key, url]) =>
                url && (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-foreground/40 hover:text-accent transition-colors"
                  >
                    {socialIcons[key] || key}
                  </a>
                ),
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-foreground/30">
            &copy; {year} {config.artist.name}. {t("allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
}
