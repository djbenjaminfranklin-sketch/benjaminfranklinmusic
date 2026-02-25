import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getUpcomingShows, getPastShows } from "@/lib/dynamic-config";
import ShowsContainer from "@/components/shows/ShowsContainer";
import siteConfig from "../../../../site.config";
import type { Show, PastSet } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("showsTitle"),
    description: t("showsDescription"),
  };
}

export default function ShowsPage() {
  // Try DB first, fallback to static config
  let upcoming: Show[] = getUpcomingShows();
  let past: PastSet[] = getPastShows().map((s) => ({
    id: s.id,
    name: s.name,
    venue: s.venue,
    city: s.city,
    country: s.country,
    date: s.date,
    tracklist: s.tracklist,
  }));

  // Fallback to static config if DB is empty
  if (upcoming.length === 0 && past.length === 0) {
    upcoming = siteConfig.shows.upcoming;
    past = siteConfig.shows.past;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background crowd photo */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/crowd.jpg"
          alt=""
          fill
          className="object-cover opacity-40"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>

      <main className="mx-auto max-w-4xl px-4 pt-40 sm:pt-24 pb-16">
        <ShowsContainer upcoming={upcoming} past={past} />
      </main>
    </div>
  );
}
