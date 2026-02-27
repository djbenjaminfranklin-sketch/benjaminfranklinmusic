"use client";

import { Camera, Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PermissionDialogProps {
  type: "camera" | "microphone" | "camera+microphone";
  open: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

export default function PermissionDialog({ type, open, onAllow, onDeny }: PermissionDialogProps) {
  const t = useTranslations("permissions");

  if (!open) return null;

  const config = {
    camera: { icon: Camera, title: t("cameraTitle"), description: t("cameraDescription") },
    microphone: { icon: Mic, title: t("microphoneTitle"), description: t("microphoneDescription") },
    "camera+microphone": { icon: Camera, title: t("cameraMicTitle"), description: t("cameraMicDescription") },
  }[type];

  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDeny} />
      <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-accent" />
          {type === "camera+microphone" && (
            <Mic className="h-5 w-5 text-accent -ml-1" />
          )}
        </div>

        <h3 className="text-lg font-bold text-primary mb-2">{config.title}</h3>
        <p className="text-sm text-foreground/60 mb-6">{config.description}</p>

        <div className="flex gap-3">
          <button
            onClick={onDeny}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors",
              "bg-foreground/10 text-foreground/60 hover:bg-foreground/15"
            )}
          >
            {t("deny")}
          </button>
          <button
            onClick={onAllow}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
              "bg-accent text-background hover:bg-accent/90"
            )}
          >
            {t("allow")}
          </button>
        </div>
      </div>
    </div>
  );
}
