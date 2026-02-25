import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { fr, es, enUS } from "date-fns/locale";

const dateFnsLocales: Record<string, typeof enUS> = {
  en: enUS,
  fr: fr,
  es: es,
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string, locale = "en") {
  return format(new Date(dateStr), "MMM d, yyyy", {
    locale: dateFnsLocales[locale] || enUS,
  });
}

export function formatDateTime(dateStr: string, locale = "en") {
  return format(new Date(dateStr), "EEE, MMM d, yyyy 'at' h:mm a", {
    locale: dateFnsLocales[locale] || enUS,
  });
}

export function timeAgo(dateStr: string, locale = "en") {
  return formatDistanceToNow(new Date(dateStr), {
    addSuffix: true,
    locale: dateFnsLocales[locale] || enUS,
  });
}
