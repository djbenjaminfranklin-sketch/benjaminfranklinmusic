"use client";

import { useEffect, useState } from "react";

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculate(target: string): CountdownResult {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function useCountdown(targetDate: string): CountdownResult {
  const [timeLeft, setTimeLeft] = useState<CountdownResult>(calculate(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculate(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}
