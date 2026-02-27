"use client";

import { useEffect, useState, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Music,
  Star,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Release } from "@/types";

type ReleaseType = Release["type"];

interface ReleaseForm {
  title: string;
  type: ReleaseType;
  releaseDate: string;
  coverUrl: string;
  audioUrl: string;
  spotifyUrl: string;
  spotifyEmbedId: string;
  featured: boolean;
  sortOrder: number;
}

const emptyForm: ReleaseForm = {
  title: "",
  type: "single",
  releaseDate: "",
  coverUrl: "",
  audioUrl: "",
  spotifyUrl: "",
  spotifyEmbedId: "",
  featured: false,
  sortOrder: 0,
};

const typeBadgeColors: Record<ReleaseType, string> = {
  single: "bg-blue-500/20 text-blue-400",
  ep: "bg-purple-500/20 text-purple-400",
  album: "bg-emerald-500/20 text-emerald-400",
  remix: "bg-amber-500/20 text-amber-400",
};

export default function ReleasesManager() {
  const t = useTranslations("admin");

  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReleaseForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [saveError, setSaveError] = useState("");

  const coverInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // ---------- Fetch releases ----------
  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = () => {
    setLoading(true);
    fetch("/api/admin/releases")
      .then((r) => r.json())
      .then((data) => setReleases(data.releases || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // ---------- Form helpers ----------
  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (release: Release) => {
    setEditingId(release.id);
    setForm({
      title: release.title,
      type: release.type,
      releaseDate: release.releaseDate,
      coverUrl: release.coverUrl,
      audioUrl: release.audioUrl ?? "",
      spotifyUrl: release.spotifyUrl ?? "",
      spotifyEmbedId: release.spotifyEmbedId ?? "",
      featured: release.featured ?? false,
      sortOrder: 0,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof ReleaseForm>(
    key: K,
    value: ReleaseForm[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ---------- Upload ----------
  const uploadFile = async (file: File, category: "covers" | "audio") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url as string;
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadFile(file, "covers");
      updateField("coverUrl", url);
    } catch {
      // silently fail
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAudio(true);
    try {
      const url = await uploadFile(file, "audio");
      updateField("audioUrl", url);
    } catch {
      // silently fail
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  // ---------- Save (create / update) ----------
  const handleSave = async () => {
    if (!form.title || !form.releaseDate || !form.coverUrl) return;
    setSaving(true);
    setSaveError("");

    const body: Record<string, unknown> = {
      title: form.title,
      type: form.type,
      releaseDate: form.releaseDate,
      coverUrl: form.coverUrl,
      featured: form.featured,
      sortOrder: form.sortOrder,
    };
    if (form.audioUrl) body.audioUrl = form.audioUrl;
    if (form.spotifyUrl) body.spotifyUrl = form.spotifyUrl;
    if (form.spotifyEmbedId) body.spotifyEmbedId = form.spotifyEmbedId;

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/releases/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setReleases((prev) =>
          prev.map((r) => (r.id === editingId ? updated : r))
        );
      } else {
        const res = await fetch("/api/admin/releases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        setReleases((prev) => [created, ...prev]);
      }
      closeForm();
    } catch {
      setSaveError(editingId ? "Failed to update release" : "Failed to add release");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Delete ----------
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/releases/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setReleases((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- Input classes ----------
  const inputClass =
    "bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full focus:outline-none focus:ring-1 focus:ring-accent";

  const primaryBtnClass =
    "bg-accent text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">{t("releases")}</h1>
        {!showForm && (
          <button onClick={openAddForm} className={cn(primaryBtnClass, "flex items-center gap-2")}>
            <Plus className="h-4 w-4" />
            {t("addRelease")}
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">
              {editingId ? t("editRelease") : t("addRelease")}
            </h2>
            <button
              onClick={closeForm}
              className="text-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground/60 mb-1">
              {t("title")}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              className={inputClass}
              placeholder={t("title")}
            />
          </div>

          {/* Type + Release Date row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/60 mb-1">
                {t("type")}
              </label>
              <select
                value={form.type}
                onChange={(e) => updateField("type", e.target.value as ReleaseType)}
                className={inputClass}
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
                <option value="remix">Remix</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/60 mb-1">
                {t("releaseDate")}
              </label>
              <input
                type="date"
                value={form.releaseDate}
                onChange={(e) => updateField("releaseDate", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Cover upload */}
          <div>
            <label className="block text-sm font-medium text-foreground/60 mb-1">
              {t("cover")}
            </label>
            <div className="flex items-center gap-4">
              {form.coverUrl ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.coverUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center">
                  <Music className="h-6 w-6 text-foreground/20" />
                </div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors",
                  uploadingCover && "opacity-50 pointer-events-none"
                )}
              >
                {uploadingCover ? (
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("uploadCover")}
              </button>
            </div>
          </div>

          {/* Audio upload */}
          <div>
            <label className="block text-sm font-medium text-foreground/60 mb-1">
              {t("audio")}
            </label>
            <div className="flex items-center gap-4">
              {form.audioUrl && (
                <span className="text-xs text-foreground/40 truncate max-w-[200px]">
                  {form.audioUrl}
                </span>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={uploadingAudio}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors",
                  uploadingAudio && "opacity-50 pointer-events-none"
                )}
              >
                {uploadingAudio ? (
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("uploadAudio")}
              </button>
            </div>
          </div>

          {/* Spotify URL */}
          <div>
            <label className="block text-sm font-medium text-foreground/60 mb-1">
              Spotify URL
            </label>
            <input
              type="url"
              value={form.spotifyUrl}
              onChange={(e) => updateField("spotifyUrl", e.target.value)}
              className={inputClass}
              placeholder="https://open.spotify.com/track/..."
            />
          </div>

          {/* Spotify Embed ID */}
          <div>
            <label className="block text-sm font-medium text-foreground/60 mb-1">
              Spotify Embed ID
            </label>
            <input
              type="text"
              value={form.spotifyEmbedId}
              onChange={(e) => updateField("spotifyEmbedId", e.target.value)}
              className={inputClass}
              placeholder="e.g. 4iV5W9uYEdYUVa79Axb7Rh"
            />
          </div>

          {/* Featured toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateField("featured", !form.featured)}
              className={cn(
                "relative w-10 h-6 rounded-full transition-colors",
                form.featured ? "bg-accent" : "bg-foreground/20"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                  form.featured && "translate-x-4"
                )}
              />
            </button>
            <label className="text-sm text-foreground/60 flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              {t("featured")}
            </label>
          </div>

          {saveError && (
            <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{saveError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.title || !form.releaseDate || !form.coverUrl}
              className={primaryBtnClass}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  {t("saving")}
                </span>
              ) : editingId ? (
                t("saveChanges")
              ) : (
                t("addRelease")
              )}
            </button>
            <button
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm font-medium text-foreground/50 hover:text-foreground transition-colors"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Releases Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : releases.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Music className="h-10 w-10 text-foreground/15" />
          <p className="text-sm text-foreground/30">{t("noReleases")}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {releases.map((release) => (
            <div
              key={release.id}
              className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 group cursor-pointer hover:border-foreground/20 transition-colors"
              onClick={() => openEditForm(release)}
            >
              {/* Top row: cover + info */}
              <div className="flex items-start gap-3">
                <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={release.coverUrl}
                    alt={release.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-primary truncate">
                    {release.title}
                  </h3>
                  <p className="text-xs text-foreground/40 mt-0.5">
                    {new Date(release.releaseDate).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0",
                    typeBadgeColors[release.type]
                  )}
                >
                  {release.type.toUpperCase()}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 text-xs text-foreground/30">
                {release.featured && (
                  <span className="flex items-center gap-1 text-accent">
                    <Star className="h-3 w-3" />
                    {t("featured")}
                  </span>
                )}
                {release.spotifyUrl && (
                  <span>Spotify</span>
                )}
                {release.audioUrl && (
                  <span>{t("audio")}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditForm(release);
                  }}
                  className="flex items-center gap-1.5 text-xs text-foreground/50 hover:text-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (deletingId === release.id) return;
                    if (window.confirm(t("confirmDeleteRelease"))) {
                      handleDelete(release.id);
                    }
                  }}
                  disabled={deletingId === release.id}
                  className="flex items-center gap-1.5 text-xs text-foreground/50 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {deletingId === release.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
