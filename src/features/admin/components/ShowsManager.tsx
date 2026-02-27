"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Download,
  Music,
  MapPin,
  Calendar,
  Ticket,
  ImagePlus,
} from "lucide-react";

interface Show {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  ticketUrl?: string;
  soldOut: boolean;
  isPast: boolean;
  tracklist?: string[];
  flyerUrl?: string;
  sortOrder?: number;
}

type ShowFormData = {
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  ticketUrl: string;
  soldOut: boolean;
  flyerUrl: string;
};

const emptyForm: ShowFormData = {
  name: "",
  venue: "",
  city: "",
  country: "",
  date: "",
  ticketUrl: "",
  soldOut: false,
  flyerUrl: "",
};

export default function ShowsManager() {
  const t = useTranslations("admin");

  const [upcoming, setUpcoming] = useState<Show[]>([]);
  const [past, setPast] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<ShowFormData>(emptyForm);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ShowFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tracklist editing (for past shows)
  const [editingTracklistId, setEditingTracklistId] = useState<string | null>(null);
  const [tracklistDraft, setTracklistDraft] = useState<string[]>([]);
  const [newTrack, setNewTrack] = useState("");

  // Flyer upload
  const [uploadingFlyer, setUploadingFlyer] = useState<string | null>(null); // "add" | showId | null

  // Seeding
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  // --- Fetch shows ---
  const fetchShows = async () => {
    try {
      const res = await fetch("/api/admin/shows");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUpcoming(data.upcoming || []);
      setPast(data.past || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShows();
  }, []);

  // --- Upload flyer for add form ---
  const handleAddFormFlyerUpload = async (file: File) => {
    setUploadingFlyer("add");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "flyers");
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAddForm((prev) => ({ ...prev, flyerUrl: data.url }));
    } catch {
      // silently fail
    } finally {
      setUploadingFlyer(null);
    }
  };

  // --- Add show ---
  const handleAdd = async () => {
    if (!addForm.name || !addForm.venue || !addForm.city || !addForm.country || !addForm.date) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          venue: addForm.venue,
          city: addForm.city,
          country: addForm.country,
          date: new Date(addForm.date).toISOString(),
          ticketUrl: addForm.ticketUrl || undefined,
          soldOut: addForm.soldOut,
          isPast: activeTab === "past",
          flyerUrl: addForm.flyerUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setAddForm(emptyForm);
      setShowAddForm(false);
      await fetchShows();
    } catch {
      // silently fail
    } finally {
      setAdding(false);
    }
  };

  // --- Edit show ---
  const startEdit = (show: Show) => {
    setEditingId(show.id);
    setEditForm({
      name: show.name,
      venue: show.venue,
      city: show.city,
      country: show.country,
      date: show.date ? toDatetimeLocal(show.date) : "",
      ticketUrl: show.ticketUrl || "",
      soldOut: show.soldOut,
      flyerUrl: show.flyerUrl || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleEdit = async (id: string) => {
    if (!editForm.name || !editForm.venue || !editForm.city || !editForm.country || !editForm.date) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/shows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          venue: editForm.venue,
          city: editForm.city,
          country: editForm.country,
          date: new Date(editForm.date).toISOString(),
          ticketUrl: editForm.ticketUrl || null,
          soldOut: editForm.soldOut,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      setEditForm(emptyForm);
      await fetchShows();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  // --- Delete show ---
  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/shows/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete show");
        return;
      }
      setDeletingId(null);
      await fetchShows();
    } catch {
      alert("Network error — could not delete show");
    } finally {
      setDeleting(false);
    }
  };

  // --- Delete all shows ---
  const handleDeleteAll = async () => {
    if (!window.confirm(t("confirmDeleteAll") || "Delete ALL shows? This cannot be undone.")) return;
    const allShows = [...upcoming, ...past];
    for (const show of allShows) {
      try {
        await fetch(`/api/admin/shows/${show.id}`, { method: "DELETE" });
      } catch {
        // continue
      }
    }
    await fetchShows();
  };

  // --- Tracklist ---
  const startTracklistEdit = (show: Show) => {
    setEditingTracklistId(show.id);
    setTracklistDraft(show.tracklist ? [...show.tracklist] : []);
    setNewTrack("");
  };

  const addTrackToList = () => {
    if (!newTrack.trim()) return;
    setTracklistDraft((prev) => [...prev, newTrack.trim()]);
    setNewTrack("");
  };

  const removeTrackFromList = (index: number) => {
    setTracklistDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const saveTracklist = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/shows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracklist: tracklistDraft.length > 0 ? tracklistDraft : null,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingTracklistId(null);
      setTracklistDraft([]);
      await fetchShows();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  // --- Seed ---
  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage("");
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      if (!res.ok) throw new Error();
      setSeedMessage(t("seeded"));
      await fetchShows();
      setTimeout(() => setSeedMessage(""), 3000);
    } catch {
      // silently fail
    } finally {
      setSeeding(false);
    }
  };

  // --- Flyer upload ---
  const handleFlyerUpload = async (file: File, showId: string) => {
    setUploadingFlyer(showId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "flyers");
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Update the show with the flyer URL
      await fetch(`/api/admin/shows/${showId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerUrl: data.url }),
      });
      await fetchShows();
    } catch {
      // silently fail
    } finally {
      setUploadingFlyer(null);
    }
  };

  const removeFlyer = async (showId: string) => {
    try {
      await fetch(`/api/admin/shows/${showId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyerUrl: null }),
      });
      await fetchShows();
    } catch {
      // silently fail
    }
  };

  // --- Helpers ---
  const toDatetimeLocal = (iso: string) => {
    try {
      const d = new Date(iso);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const shows = activeTab === "upcoming" ? upcoming : past;

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t("shows")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {(upcoming.length > 0 || past.length > 0) && (
            <button
              onClick={handleDeleteAll}
              className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                {t("deleteAll") || "Delete All"}
              </span>
            </button>
          )}
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setAddForm(emptyForm);
            }}
            className="bg-accent text-background px-3 py-2 rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("addShow")}
            </span>
          </button>
        </div>
      </div>

      {seedMessage && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2 text-sm text-green-400">
          {seedMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "upcoming"
              ? "bg-accent text-background"
              : "text-foreground/50 hover:text-foreground/80"
          }`}
        >
          {t("upcoming")} ({upcoming.length})
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "past"
              ? "bg-accent text-background"
              : "text-foreground/50 hover:text-foreground/80"
          }`}
        >
          {t("past")} ({past.length})
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground/60">{t("addShow")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder={t("showName")}
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
            <input
              type="text"
              placeholder={t("venue")}
              value={addForm.venue}
              onChange={(e) => setAddForm({ ...addForm, venue: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
            <input
              type="text"
              placeholder={t("city")}
              value={addForm.city}
              onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
            <input
              type="text"
              placeholder={t("country")}
              value={addForm.country}
              onChange={(e) => setAddForm({ ...addForm, country: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
            <input
              type="datetime-local"
              value={addForm.date}
              onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
            <input
              type="url"
              placeholder={t("ticketUrl")}
              value={addForm.ticketUrl}
              onChange={(e) => setAddForm({ ...addForm, ticketUrl: e.target.value })}
              className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.soldOut}
              onChange={(e) => setAddForm({ ...addForm, soldOut: e.target.checked })}
              className="rounded border-border"
            />
            {t("soldOut")}
          </label>
          {/* Flyer upload */}
          <div className="flex items-center gap-3">
            {addForm.flyerUrl ? (
              <div className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-background group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={addForm.flyerUrl} alt="Flyer" className="w-full h-full object-cover" />
                <button
                  onClick={() => setAddForm({ ...addForm, flyerUrl: "" })}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-2 rounded-lg text-xs hover:bg-purple-500/20 transition-colors cursor-pointer">
                <span className="flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {uploadingFlyer === "add" ? "..." : "Flyer"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAddFormFlyerUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !addForm.name || !addForm.venue || !addForm.city || !addForm.country || !addForm.date}
              className="bg-accent text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {adding ? "..." : t("addShow")}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setAddForm(emptyForm);
              }}
              className="bg-foreground/10 text-foreground/60 px-4 py-2 rounded-lg text-sm font-medium hover:bg-foreground/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Calendar className="h-10 w-10 text-foreground/15" />
          <p className="text-sm text-foreground/30">
            {activeTab === "upcoming" ? "No upcoming shows." : "No past shows."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shows.map((show) => (
            <div key={show.id} className="rounded-xl border border-border bg-card p-5">
              {editingId === show.id ? (
                /* --- Inline edit mode --- */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder={t("showName")}
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                    <input
                      type="text"
                      placeholder={t("venue")}
                      value={editForm.venue}
                      onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                    <input
                      type="text"
                      placeholder={t("city")}
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                    <input
                      type="text"
                      placeholder={t("country")}
                      value={editForm.country}
                      onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                    <input
                      type="datetime-local"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                    <input
                      type="url"
                      placeholder={t("ticketUrl")}
                      value={editForm.ticketUrl}
                      onChange={(e) => setEditForm({ ...editForm, ticketUrl: e.target.value })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.soldOut}
                      onChange={(e) => setEditForm({ ...editForm, soldOut: e.target.checked })}
                      className="rounded border-border"
                    />
                    {t("soldOut")}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(show.id)}
                      disabled={saving}
                      className="bg-accent text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5">
                        <Check className="h-4 w-4" />
                        {saving ? t("saving") : t("save")}
                      </span>
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="bg-foreground/10 text-foreground/60 px-3 py-2 rounded-lg text-sm hover:bg-foreground/20 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* --- Display mode --- */
                <div className="space-y-3">
                  {/* Show info + flyer */}
                  <div className="flex gap-4">
                    {/* Flyer thumbnail */}
                    {show.flyerUrl && (
                      <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-border bg-background group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={show.flyerUrl} alt="Flyer" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeFlyer(show.id)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-primary">{show.name}</h3>
                        {show.soldOut && (
                          <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                            SOLD OUT
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        <p className="text-sm text-foreground/60 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="break-all">{show.venue} &mdash; {show.city}, {show.country}</span>
                        </p>
                        <p className="text-sm text-foreground/40 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {formatDate(show.date)}
                        </p>
                        {show.ticketUrl && (
                          <a
                            href={show.ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-accent hover:underline flex items-center gap-1.5 w-fit"
                          >
                            <Ticket className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{show.ticketUrl}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons — stacked row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                    {/* Flyer upload */}
                    <label className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg text-xs hover:bg-purple-500/20 transition-colors cursor-pointer">
                      <span className="flex items-center gap-1.5">
                        <ImagePlus className="h-3.5 w-3.5" />
                        {uploadingFlyer === show.id ? "..." : "Flyer"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFlyerUpload(file, show.id);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {activeTab === "past" && (
                      <button
                        onClick={() => startTracklistEdit(show)}
                        className="bg-accent/10 text-accent border border-accent/20 px-3 py-1.5 rounded-lg text-xs hover:bg-accent/20 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Music className="h-3.5 w-3.5" />
                          {t("tracklist")}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(show)}
                      className="bg-foreground/5 text-foreground/50 border border-border px-3 py-1.5 rounded-lg text-xs hover:bg-foreground/10 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        {t("editShow")}
                      </span>
                    </button>
                    {deletingId === show.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400">{t("confirmDelete")}</span>
                        <button
                          onClick={() => handleDelete(show.id)}
                          disabled={deleting}
                          className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="bg-foreground/5 text-foreground/50 border border-border px-3 py-1.5 rounded-lg text-xs hover:bg-foreground/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(show.id)}
                        className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs hover:bg-red-500/20 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("deleteShow")}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Tracklist display for past shows */}
                  {activeTab === "past" && show.tracklist && show.tracklist.length > 0 && editingTracklistId !== show.id && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2">
                        {t("tracklist")}
                      </p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        {show.tracklist.map((track, i) => (
                          <li key={i} className="text-sm text-foreground/60">
                            {track}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Tracklist editor for past shows */}
                  {editingTracklistId === show.id && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                        {t("tracklist")}
                      </p>
                      {tracklistDraft.length > 0 && (
                        <ol className="space-y-1">
                          {tracklistDraft.map((track, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className="text-xs text-foreground/30 w-5 text-right tabular-nums">
                                {i + 1}.
                              </span>
                              <span className="text-sm text-foreground/70 flex-1">{track}</span>
                              <button
                                onClick={() => removeTrackFromList(i)}
                                className="text-red-400 hover:text-red-300 transition-colors p-0.5"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t("addTrack")}
                          value={newTrack}
                          onChange={(e) => setNewTrack(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTrackToList();
                            }
                          }}
                          className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm w-full"
                        />
                        <button
                          onClick={addTrackToList}
                          disabled={!newTrack.trim()}
                          className="bg-accent/10 text-accent border border-accent/20 px-3 py-2 rounded-lg text-sm hover:bg-accent/20 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveTracklist(show.id)}
                          disabled={saving}
                          className="bg-accent text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          <span className="flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            {saving ? t("saving") : t("save")}
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setEditingTracklistId(null);
                            setTracklistDraft([]);
                            setNewTrack("");
                          }}
                          className="bg-foreground/10 text-foreground/60 px-3 py-2 rounded-lg text-sm hover:bg-foreground/20 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
