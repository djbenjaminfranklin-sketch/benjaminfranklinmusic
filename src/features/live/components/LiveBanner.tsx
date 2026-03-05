"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LiveBanner() {
  const [isLive, setIsLive] = useState(false);
  const t = useTranslations("live");

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/live/stream");

      es.addEventListener("init", (e) => {
        const data = JSON.parse(e.data);
        setIsLive(data.status?.isLive ?? false);
      });

      es.addEventListener("status", (e) => {
        const data = JSON.parse(e.data);
        setIsLive(data.isLive ?? false);
      });

      es.onerror = () => {
        es?.close();
        if (!closed) setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      closed = true;
      es?.close();
    };
  }, []);

  return (
    <AnimatePresence>
      {isLive && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-[60]"
        >
          <Link href="/live" className="block">
            <div className="bg-red-600/95 backdrop-blur-sm px-4 py-2.5 flex items-center justify-center gap-3 cursor-pointer hover:bg-red-600 transition-colors">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <Radio className="h-4 w-4 text-white" />
              <span className="text-sm font-bold text-white tracking-wide">
                {t("liveNow")}
              </span>
              <span className="text-xs text-white/80">
                — {t("subtitle")}
              </span>
            </div>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
