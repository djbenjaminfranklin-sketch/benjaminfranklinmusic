"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/shared/lib/utils";

const localeConfig: Record<string, { flag: string; label: string }> = {
  en: { flag: "\u{1F1EC}\u{1F1E7}", label: "EN" },
  fr: { flag: "\u{1F1EB}\u{1F1F7}", label: "FR" },
  es: { flag: "\u{1F1EA}\u{1F1F8}", label: "ES" },
};

export default function LanguageSelector() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale as typeof routing.locales[number] });
    setOpen(false);
  };

  const current = localeConfig[locale];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
        aria-label="Change language"
      >
        <span className="text-sm leading-none">{current?.flag}</span>
        {current?.label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden z-50 min-w-[100px]">
          {routing.locales.map((loc) => {
            const conf = localeConfig[loc];
            return (
              <button
                key={loc}
                onClick={() => switchLocale(loc)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-left transition-colors",
                  loc === locale
                    ? "text-accent bg-accent/10"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5",
                )}
              >
                <span className="text-sm leading-none">{conf?.flag}</span>
                {conf?.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
