"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, MapPin, Music } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { PastSet as PastSetType } from "@/shared/types";
import { formatDate } from "@/shared/lib/utils";

interface PastSetProps {
  set: PastSetType;
}

export default function PastSet({ set }: PastSetProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("shows");
  const locale = useLocale();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 sm:p-6 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">{set.name}</h3>
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              {set.venue} &mdash; {set.city}, {set.country}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{formatDate(set.date, locale)}</span>
          </div>
        </div>

        {set.tracklist && set.tracklist.length > 0 && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-5 w-5 text-foreground/40" />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && set.tracklist && set.tracklist.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2 mb-3">
                <Music className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-accent">{t("tracklist")}</span>
              </div>
              <ol className="space-y-1.5">
                {set.tracklist.map((track, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/70">
                    <span className="text-foreground/30 font-mono w-6 text-right shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{track}</span>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
