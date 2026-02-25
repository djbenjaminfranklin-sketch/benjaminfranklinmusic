"use client";

import { useTranslations } from "next-intl";
import { useCountdown } from "@/hooks/useCountdown";

interface CountdownProps {
  targetDate: string;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-lg bg-background border border-border px-2.5 py-1 font-mono text-sm font-bold text-accent tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wider text-foreground/40">
        {label}
      </span>
    </div>
  );
}

export default function Countdown({ targetDate }: CountdownProps) {
  const { days, hours, minutes, seconds } = useCountdown(targetDate);
  const t = useTranslations("countdown");

  return (
    <div className="flex items-center gap-2">
      <CountdownUnit value={days} label={t("days")} />
      <span className="text-foreground/20 font-mono">:</span>
      <CountdownUnit value={hours} label={t("hours")} />
      <span className="text-foreground/20 font-mono">:</span>
      <CountdownUnit value={minutes} label={t("minutes")} />
      <span className="text-foreground/20 font-mono">:</span>
      <CountdownUnit value={seconds} label={t("seconds")} />
    </div>
  );
}
