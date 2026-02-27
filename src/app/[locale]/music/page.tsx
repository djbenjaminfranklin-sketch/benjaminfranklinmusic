import { getTranslations } from "next-intl/server";
import { getReleases } from "@/shared/lib/dynamic-config";
import MusicContainer from "@/features/music/components/MusicContainer";
import siteConfig from "../../../../site.config";
import type { Release } from "@/shared/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("musicTitle"),
    description: t("musicDescription"),
  };
}

export default function MusicPage() {
  // Try DB first, fallback to static config
  let releases: Release[] = getReleases();

  if (releases.length === 0) {
    releases = siteConfig.releases;
  }

  return <MusicContainer releases={releases} />;
}
