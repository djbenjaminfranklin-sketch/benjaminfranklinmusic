"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Ticket } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { Show } from "@/shared/types";
import { cn, formatDateTime } from "@/shared/lib/utils";
import Countdown from "@/shared/ui/Countdown";
import Badge from "@/shared/ui/Badge";

interface UpcomingShowProps {
  show: Show;
}

export default function UpcomingShow({ show }: UpcomingShowProps) {
  const t = useTranslations("shows");
  const locale = useLocale();

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-foreground">{show.name}</h3>
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              {show.venue} &mdash; {show.city}, {show.country}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{formatDateTime(show.date, locale)}</span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Countdown targetDate={show.date} />

          {show.soldOut ? (
            <Badge variant="danger">{t("soldOut")}</Badge>
          ) : show.ticketUrl ? (
            <a
              href={show.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent/90"
              )}
            >
              <Ticket className="h-4 w-4" />
              {t("tickets")}
            </a>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
