"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SiteConfig {
  artist: { name: string; email: string };
  assets: { logo: string; logoTransparent: string; avatar: string; heroImage: string };
  theme: { accent: string; background: string; foreground: string; card: string; border: string; primary: string };
  socials: { spotify: string; instagram: string; soundcloud: string; tiktok: string };
  navigation: { key: string; href: string; icon: string }[];
  fanZone: { djPassword: string };
  live: { adminPassword: string };
  booking: { recipientEmail: string; eventTypeKeys: readonly string[]; budgetRangeKeys: readonly string[] };
}

const SiteConfigContext = createContext<SiteConfig | undefined>(undefined);

export function SiteConfigProvider({ config, children }: { config: SiteConfig; children: ReactNode }) {
  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig(): SiteConfig {
  const context = useContext(SiteConfigContext);
  if (!context) {
    throw new Error("useSiteConfig must be used within a SiteConfigProvider");
  }
  return context;
}
