"use client";

import { useEffect, useState, useRef, useCallback, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Save,
  Check,
  Upload,
  User,
  Image as ImageIcon,
  Palette,
  Share2,
  FileText,
  Lock,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Settings {
  artist: { name: string; email: string };
  assets: { logo: string; avatar: string; heroImage: string; bioImage: string };
  theme: {
    accent: string;
    background: string;
    foreground: string;
    card: string;
    border: string;
    primary: string;
  };
  socials: {
    spotify: string;
    instagram: string;
    tiktok: string;
  };
  bio: { en: string; fr: string; es: string };
  tagline: { en: string; fr: string; es: string };
  fanZone: { djPassword: string };
  booking: { recipientEmail: string };
}

const DEFAULT_SETTINGS: Settings = {
  artist: { name: "", email: "" },
  assets: { logo: "", avatar: "", heroImage: "", bioImage: "" },
  theme: {
    accent: "#e11d48",
    background: "#09090b",
    foreground: "#fafafa",
    card: "#18181b",
    border: "#27272a",
    primary: "#ffffff",
  },
  socials: { spotify: "", instagram: "", tiktok: "" },
  bio: { en: "", fr: "", es: "" },
  tagline: { en: "", fr: "", es: "" },
  fanZone: { djPassword: "" },
  booking: { recipientEmail: "" },
};

type Locale = "en" | "fr" | "es";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const inputClass =
  "w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-foreground/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30";

const cardClass = "rounded-2xl border border-border bg-card p-5 space-y-4";

const labelClass = "block text-xs font-medium text-foreground/50 mb-1.5";

const headingIcon =
  "w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0";

/* ------------------------------------------------------------------ */
/*  Reusable sub-components                                            */
/* ------------------------------------------------------------------ */

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={headingIcon}>
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <h3 className="text-sm font-semibold text-foreground/60">{title}</h3>
    </div>
  );
}

function SaveButton({
  saving,
  saved,
  onClick,
  label,
  savedLabel,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
  label: string;
  savedLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={cn(
        "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
        saved
          ? "bg-green-600/20 text-green-400 border border-green-500/30"
          : "bg-accent text-background hover:bg-accent/90",
        "disabled:opacity-50"
      )}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : saved ? (
        <Check className="h-4 w-4" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {saved ? savedLabel : label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function SettingsPanel() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  /* Per-section save state:  "idle" | "saving" | "saved" */
  const [sectionState, setSectionState] = useState<
    Record<string, "idle" | "saving" | "saved">
  >({});

  /* Bio / tagline locale tab */
  const [bioLocale, setBioLocale] = useState<Locale>("en");

  /* File-upload refs */
  const logoRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLInputElement>(null);

  /* Per-asset upload state */
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  /* Image position state (vertical %) */
  const [imagePositions, setImagePositions] = useState<Record<string, string>>({
    heroImage: "25",
    bioImage: "15",
  });

  /* ---- Fetch settings on mount ---- */
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings((prev) => deepMerge(prev, data));
        if (data.assets) {
          setImagePositions((prev) => ({
            ...prev,
            ...(data.assets.heroImagePos ? { heroImage: data.assets.heroImagePos } : {}),
            ...(data.assets.bioImagePos ? { bioImage: data.assets.bioImagePos } : {}),
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ---- Deep-merge helper (simple 2-level) ---- */
  function deepMerge(base: Settings, incoming: Record<string, unknown>): Settings {
    const result = { ...base } as Record<string, unknown>;
    for (const key of Object.keys(base)) {
      if (
        incoming[key] &&
        typeof incoming[key] === "object" &&
        !Array.isArray(incoming[key])
      ) {
        result[key] = {
          ...(base as unknown as Record<string, Record<string, unknown>>)[key],
          ...(incoming[key] as Record<string, unknown>),
        };
      } else if (incoming[key] !== undefined) {
        result[key] = incoming[key];
      }
    }
    return result as unknown as Settings;
  }

  /* ---- Save a section ---- */
  async function saveSection(
    section: string,
    payload: Record<string, unknown>
  ) {
    setSectionState((prev) => ({ ...prev, [section]: "saving" }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setSectionState((prev) => ({ ...prev, [section]: "saved" }));
      setTimeout(() => {
        setSectionState((prev) => ({ ...prev, [section]: "idle" }));
      }, 2000);
    } catch {
      setSectionState((prev) => ({ ...prev, [section]: "idle" }));
    }
  }

  /* ---- Upload file ---- */
  async function uploadFile(
    file: File,
    category: string,
    settingsKey: keyof Settings["assets"]
  ) {
    setUploading((prev) => ({ ...prev, [settingsKey]: true }));
    setUploadError((prev) => ({ ...prev, [settingsKey]: "" }));
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      const newUrl = data.url;

      setSettings((prev) => ({
        ...prev,
        assets: { ...prev.assets, [settingsKey]: newUrl },
      }));

      // Auto-save to DB so the user doesn't have to click Save
      const dbKey = `assets.${settingsKey}`;
      const saveRes = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [dbKey]: newUrl }),
      });
      if (!saveRes.ok) throw new Error("Save failed");

      setSectionState((prev) => ({ ...prev, assets: "saved" }));
      setTimeout(() => {
        setSectionState((prev) => ({ ...prev, assets: "idle" }));
      }, 2000);
    } catch (err) {
      setUploadError((prev) => ({
        ...prev,
        [settingsKey]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading((prev) => ({ ...prev, [settingsKey]: false }));
    }
  }

  function handleFileChange(
    e: ChangeEvent<HTMLInputElement>,
    settingsKey: keyof Settings["assets"]
  ) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, "images", settingsKey);
  }

  /* ---- Save image position (debounced) ---- */
  const posTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  const handlePositionChange = useCallback((key: "heroImage" | "bioImage", value: string) => {
    setImagePositions((prev) => ({ ...prev, [key]: value }));

    // Debounce the save — wait 500ms after last change
    if (posTimerRef.current[key]) clearTimeout(posTimerRef.current[key]);
    posTimerRef.current[key] = setTimeout(async () => {
      const dbKey = `assets.${key}Pos`;
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [dbKey]: value }),
      });
    }, 500);
  }, []);

  /* ---- Generic updaters ---- */
  function updateNested<S extends keyof Settings>(
    section: S,
    key: string,
    value: string
  ) {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown>), [key]: value },
    }));
  }

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">
        {t("settings")}
      </h1>

      {/* ------------------------------------------------------------ */}
      {/*  1. Artist Info                                               */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={User} title={t("artistInfo")} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t("name")}</label>
            <input
              type="text"
              value={settings.artist.name}
              onChange={(e) => updateNested("artist", "name", e.target.value)}
              placeholder={t("name")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("email")}</label>
            <input
              type="email"
              value={settings.artist.email}
              onChange={(e) => updateNested("artist", "email", e.target.value)}
              placeholder="artist@example.com"
              className={inputClass}
            />
          </div>
        </div>

        <SaveButton
          saving={sectionState.artist === "saving"}
          saved={sectionState.artist === "saved"}
          onClick={() =>
            saveSection("artist", { "artist.name": settings.artist.name, "artist.email": settings.artist.email })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  2. Images                                                    */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={ImageIcon} title={t("images")} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {(
            [
              ["logo", t("logo"), logoRef],
              ["avatar", t("avatar"), avatarRef],
              ["heroImage", t("heroImage"), heroRef],
              ["bioImage", t("bioImage"), bioRef],
            ] as [keyof Settings["assets"], string, React.RefObject<HTMLInputElement | null>][]
          ).map(([key, label, ref]) => (
            <div key={key} className="space-y-2">
              <label className={labelClass}>{label}</label>

              {settings.assets[key] ? (
                <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.assets[key]}
                    alt={label}
                    className="w-full h-full object-cover"
                    style={
                      (key === "heroImage" || key === "bioImage")
                        ? { objectPosition: `center ${imagePositions[key]}%` }
                        : undefined
                    }
                  />
                </div>
              ) : (
                <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-background flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-foreground/20" />
                </div>
              )}

              {/* Position slider for hero/bio images */}
              {(key === "heroImage" || key === "bioImage") && settings.assets[key] && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>Position</label>
                    <span className="text-xs text-foreground/40 font-mono">{imagePositions[key]}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imagePositions[key] || "50"}
                    onChange={(e) => handlePositionChange(key, e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-accent"
                  />
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                ref={ref}
                className="hidden"
                onChange={(e) =>
                  handleFileChange(e, key)
                }
              />
              <button
                onClick={() => ref.current?.click()}
                disabled={uploading[key]}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:border-accent/40 transition-colors w-full justify-center",
                  uploading[key] && "opacity-50 cursor-not-allowed"
                )}
              >
                {uploading[key] ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading[key] ? t("uploading") : `${t("upload")} ${label}`}
              </button>
              {uploadError[key] && (
                <p className="text-xs text-red-400">{uploadError[key]}</p>
              )}
            </div>
          ))}
        </div>

        <SaveButton
          saving={sectionState.assets === "saving"}
          saved={sectionState.assets === "saved"}
          onClick={() =>
            saveSection("assets", {
              "assets.logo": settings.assets.logo,
              "assets.avatar": settings.assets.avatar,
              "assets.heroImage": settings.assets.heroImage,
              "assets.bioImage": settings.assets.bioImage,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  3. Theme Colors                                              */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={Palette} title={t("themeColors")} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(
            [
              ["accent", t("accent")],
              ["background", t("background")],
              ["foreground", t("foreground")],
              ["card", t("card")],
              ["border", t("border")],
              ["primary", t("primary")],
            ] as [keyof Settings["theme"], string][]
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={settings.theme[key]}
                onChange={(e) => updateNested("theme", key, e.target.value)}
                className="w-10 h-10 rounded-lg border border-border bg-background cursor-pointer shrink-0 p-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground/70">
                  {label}
                </p>
                <p className="text-xs text-foreground/40 font-mono">
                  {settings.theme[key]}
                </p>
              </div>
            </div>
          ))}
        </div>

        <SaveButton
          saving={sectionState.theme === "saving"}
          saved={sectionState.theme === "saved"}
          onClick={() =>
            saveSection("theme", {
              "theme.accent": settings.theme.accent,
              "theme.background": settings.theme.background,
              "theme.foreground": settings.theme.foreground,
              "theme.card": settings.theme.card,
              "theme.border": settings.theme.border,
              "theme.primary": settings.theme.primary,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  4. Social Links                                              */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={Share2} title={t("socialLinks")} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              ["spotify", t("spotify")],
              ["instagram", t("instagram")],
              ["tiktok", t("tiktok")],
            ] as [keyof Settings["socials"], string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input
                type="url"
                value={settings.socials[key]}
                onChange={(e) => updateNested("socials", key, e.target.value)}
                placeholder={`https://${key}.com/...`}
                className={inputClass}
              />
            </div>
          ))}
        </div>

        <SaveButton
          saving={sectionState.socials === "saving"}
          saved={sectionState.socials === "saved"}
          onClick={() =>
            saveSection("socials", {
              "socials.spotify": settings.socials.spotify,
              "socials.instagram": settings.socials.instagram,
              "socials.tiktok": settings.socials.tiktok,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  5. Bio & Tagline                                             */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={FileText} title={t("bioTagline")} />

        {/* Locale tabs */}
        <div className="flex gap-1 rounded-lg bg-background border border-border p-1 w-fit">
          {(["en", "fr", "es"] as const).map((loc) => (
            <button
              key={loc}
              onClick={() => setBioLocale(loc)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                bioLocale === loc
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-foreground/40 hover:text-foreground/60 border border-transparent"
              )}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>

        <div>
          <label className={labelClass}>
            Tagline ({bioLocale.toUpperCase()})
          </label>
          <input
            type="text"
            value={settings.tagline[bioLocale]}
            onChange={(e) => updateNested("tagline", bioLocale, e.target.value)}
            placeholder={`Tagline in ${bioLocale.toUpperCase()}`}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Bio ({bioLocale.toUpperCase()})
          </label>
          <textarea
            value={settings.bio[bioLocale]}
            onChange={(e) => updateNested("bio", bioLocale, e.target.value)}
            placeholder={`Bio in ${bioLocale.toUpperCase()}`}
            rows={5}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        <SaveButton
          saving={sectionState.bio === "saving"}
          saved={sectionState.bio === "saved"}
          onClick={() =>
            saveSection("bio", {
              "bio.en": settings.bio.en,
              "bio.fr": settings.bio.fr,
              "bio.es": settings.bio.es,
              "tagline.en": settings.tagline.en,
              "tagline.fr": settings.tagline.fr,
              "tagline.es": settings.tagline.es,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  6. Passwords                                                 */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={Lock} title={t("passwords")} />

        <div>
          <label className={labelClass}>{t("djPassword")}</label>
          <input
            type="text"
            value={settings.fanZone.djPassword}
            onChange={(e) =>
              updateNested("fanZone", "djPassword", e.target.value)
            }
            placeholder="Enter DJ password"
            className={inputClass}
          />
        </div>

        <SaveButton
          saving={sectionState.fanZone === "saving"}
          saved={sectionState.fanZone === "saved"}
          onClick={() =>
            saveSection("fanZone", {
              "fanZone.djPassword": settings.fanZone.djPassword,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  7. Booking                                                   */}
      {/* ------------------------------------------------------------ */}
      <div className={cardClass}>
        <SectionHeading icon={CalendarCheck} title={t("booking")} />

        <div>
          <label className={labelClass}>{t("recipientEmail")}</label>
          <input
            type="email"
            value={settings.booking.recipientEmail}
            onChange={(e) =>
              updateNested("booking", "recipientEmail", e.target.value)
            }
            placeholder="booking@example.com"
            className={inputClass}
          />
        </div>

        <SaveButton
          saving={sectionState.booking === "saving"}
          saved={sectionState.booking === "saved"}
          onClick={() =>
            saveSection("booking", {
              "booking.recipientEmail": settings.booking.recipientEmail,
            })
          }
          label={t("save")}
          savedLabel={t("saved")}
        />
      </div>
    </div>
  );
}
