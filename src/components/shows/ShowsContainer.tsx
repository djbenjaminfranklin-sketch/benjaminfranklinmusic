"use client";

import { Calendar, Headphones, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import UpcomingShow from "./UpcomingShow";
import PastSet from "./PastSet";
import BookingForm from "./BookingForm";
import type { Show, PastSet as PastSetType } from "@/types";

interface ShowsContainerProps {
  upcoming?: Show[];
  past?: PastSetType[];
}

export default function ShowsContainer({ upcoming, past }: ShowsContainerProps) {
  const config = useSiteConfig();
  const artistName = config.artist.name;
  const t = useTranslations("shows");

  // Use provided props or fallback to empty arrays
  const upcomingShows = upcoming || [];
  const pastSets = past || [];

  return (
    <div className="space-y-16">
      {/* Upcoming Shows */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="h-5 w-5 text-accent" />
          <h2 className="text-2xl font-bold text-foreground">{t("upcoming")}</h2>
        </div>
        {upcomingShows.length > 0 ? (
          <div className="space-y-4">
            {upcomingShows.map((show) => (
              <UpcomingShow key={show.id} show={show} />
            ))}
          </div>
        ) : (
          <p className="text-foreground/50 text-sm">{t("noUpcoming")}</p>
        )}
      </section>

      {/* Past Sets */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Headphones className="h-5 w-5 text-accent" />
          <h2 className="text-2xl font-bold text-foreground">{t("pastSets")}</h2>
        </div>
        {pastSets.length > 0 ? (
          <div className="space-y-4">
            {pastSets.map((set) => (
              <PastSet key={set.id} set={set} />
            ))}
          </div>
        ) : (
          <p className="text-foreground/50 text-sm">{t("noPastSets")}</p>
        )}
      </section>

      {/* Booking Form */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <Mail className="h-5 w-5 text-accent" />
          <h2 className="text-2xl font-bold text-foreground">{t("bookArtist", { artistName })}</h2>
        </div>
        <p className="text-foreground/50 text-sm mb-6">
          {t("bookArtistSubtitle", { artistName })}
        </p>
        <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
          <BookingForm />
        </div>
      </section>
    </div>
  );
}
