"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useChat } from "@/hooks/useChat";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import LiveFeed from "./LiveFeed";
import { Wifi, WifiOff } from "lucide-react";

export default function FanZoneContainer() {
  const { messages, onlineCount, isConnected, addReaction } = useChat();
  const config = useSiteConfig();
  const t = useTranslations("fanZone");

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Background fixe */}
      <div className="fixed inset-0 -z-10">
        <Image src="/crowd.jpg" alt="" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Gradient top pour transition avec le header du site */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />

      <div className="flex-1 overflow-y-auto pb-16">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-8 pt-32 sm:pt-16">
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.07] backdrop-blur-md border border-white/[0.08] p-5">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-full overflow-hidden ring-2 ring-amber-500/40">
                  <Image
                    src={config.assets.avatar}
                    alt={config.artist.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {t("title")}
                  </h1>
                  <p className="text-sm text-white/50">
                    @{config.artist.name.toLowerCase().replace(/\s+/g, "")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {isConnected ? (
                    <Wifi className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-orange-400" />
                  )}
                  <span className="text-xs text-white/40">
                    {isConnected ? t("connected") : t("reconnecting")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/25 px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium text-green-400">
                    {t("online", { count: onlineCount })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <LiveFeed posts={messages} isLoading={false} onReaction={addReaction} variant="broadcast" />
        </div>
      </div>

      {/* Footer sticky "Vue par X" */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-black/70 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 text-center">
          <span className="text-sm text-white/50">
            {t("seenBy", { count: onlineCount })}
          </span>
        </div>
      </div>
    </div>
  );
}
