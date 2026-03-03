"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Video, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface ViewerInviteModalProps {
  inviteId: string;
  onAccept: (inviteId: string, name?: string) => void;
  onDecline: (inviteId: string) => void;
}

export default function ViewerInviteModal({ inviteId, onAccept, onDecline }: ViewerInviteModalProps) {
  const t = useTranslations("live");
  const [name, setName] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm mx-4 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Video className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary">{t("inviteTitle")}</h3>
            <p className="text-xs text-foreground/50">{t("inviteMessage")}</p>
          </div>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("inviteNamePlaceholder")}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-primary placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/50"
          maxLength={20}
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={() => onAccept(inviteId, name.trim() || undefined)}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-colors"
          >
            <Video className="h-4 w-4" />
            {t("acceptInvite")}
          </button>
          <button
            onClick={() => onDecline(inviteId)}
            className="flex items-center justify-center w-12 rounded-xl border border-border text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
