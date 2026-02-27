import db from "@/shared/lib/db";
import crypto from "crypto";
import siteConfig from "../../../site.config";

// Auto-migrate local audio URLs to R2 on module load
// Covers stay local (served from public/covers/) — only audio needs R2
try {
  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (r2Base) {
    const releases = db.prepare("SELECT id, audio_url, cover_url FROM releases").all() as { id: string; audio_url: string | null; cover_url: string | null }[];
    for (const r of releases) {
      let audioUrl = r.audio_url;
      let coverUrl = r.cover_url;
      let changed = false;

      // Migrate audio to R2
      if (audioUrl && audioUrl.startsWith("/audio/")) { audioUrl = `${r2Base}${audioUrl}`; changed = true; }

      // Revert covers back to local if they were mistakenly migrated to R2
      if (coverUrl && coverUrl.startsWith(r2Base) && coverUrl.includes("/covers/")) {
        coverUrl = coverUrl.replace(r2Base, "");
        changed = true;
      }

      if (changed) {
        db.prepare("UPDATE releases SET audio_url = ?, cover_url = ?, updated_at = datetime('now') WHERE id = ?").run(audioUrl, coverUrl, r.id);
      }
    }
  }
} catch {
  // silently ignore during build
}

// --- Site Settings ---

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM site_settings").all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// --- Dynamic Config (merge DB over static) ---

export function getDynamicConfig() {
  const settings = getAllSettings();

  return {
    artist: {
      name: settings["artist.name"] || siteConfig.artist.name,
      email: settings["artist.email"] || siteConfig.artist.email,
    },
    assets: {
      logo: settings["assets.logo"] || siteConfig.assets.logo,
      logoTransparent: settings["assets.logoTransparent"] || siteConfig.assets.logoTransparent,
      avatar: settings["assets.avatar"] || siteConfig.assets.avatar,
      heroImage: settings["assets.heroImage"] || siteConfig.assets.heroImage,
    },
    theme: {
      accent: settings["theme.accent"] || siteConfig.theme.accent,
      background: settings["theme.background"] || siteConfig.theme.background,
      foreground: settings["theme.foreground"] || siteConfig.theme.foreground,
      card: settings["theme.card"] || siteConfig.theme.card,
      border: settings["theme.border"] || siteConfig.theme.border,
      primary: settings["theme.primary"] || siteConfig.theme.primary,
    },
    socials: {
      spotify: settings["socials.spotify"] || siteConfig.socials.spotify,
      instagram: settings["socials.instagram"] || siteConfig.socials.instagram,

      tiktok: settings["socials.tiktok"] || siteConfig.socials.tiktok,
    },
    navigation: siteConfig.navigation,
    fanZone: {
      djPassword: settings["fanZone.djPassword"] || siteConfig.fanZone.djPassword,
    },
    live: {
      adminPassword: settings["live.adminPassword"] || siteConfig.live.adminPassword,
    },
    booking: {
      recipientEmail: settings["booking.recipientEmail"] || siteConfig.booking.recipientEmail,
      eventTypeKeys: siteConfig.booking.eventTypeKeys,
    },
  };
}

// --- Scheduled Live ---

export interface ScheduledLive {
  date: string;
  venue: string;
  city: string;
  flyerUrl?: string;
}

export function getScheduledLive(): ScheduledLive | null {
  const raw = getSetting("scheduledLive");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && data.date && data.venue && data.city) return data as ScheduledLive;
    return null;
  } catch {
    return null;
  }
}

export function setScheduledLive(data: ScheduledLive | null): void {
  if (data) {
    setSetting("scheduledLive", JSON.stringify(data));
  } else {
    db.prepare("DELETE FROM site_settings WHERE key = ?").run("scheduledLive");
  }
}

// --- Localized texts ---

export function getBio(locale: string): string | null {
  return getSetting(`bio.${locale}`);
}

export function getTagline(locale: string): string | null {
  return getSetting(`tagline.${locale}`);
}

// --- Shows CRUD ---

interface DBShow {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  ticket_url: string | null;
  sold_out: number;
  is_past: number;
  tracklist: string | null;
  flyer_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapShow(row: DBShow) {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    city: row.city,
    country: row.country,
    date: row.date,
    ticketUrl: row.ticket_url || undefined,
    soldOut: row.sold_out === 1,
    isPast: row.is_past === 1,
    tracklist: row.tracklist ? JSON.parse(row.tracklist) : undefined,
    flyerUrl: row.flyer_url || undefined,
    sortOrder: row.sort_order,
  };
}

export function getUpcomingShows() {
  const rows = db.prepare("SELECT * FROM shows WHERE is_past = 0 ORDER BY sort_order ASC, date ASC").all() as DBShow[];
  return rows.map(mapShow);
}

export function getPastShows() {
  const rows = db.prepare("SELECT * FROM shows WHERE is_past = 1 ORDER BY sort_order ASC, date DESC").all() as DBShow[];
  return rows.map(mapShow);
}

export function getShowById(id: string) {
  const row = db.prepare("SELECT * FROM shows WHERE id = ?").get(id) as DBShow | undefined;
  return row ? mapShow(row) : null;
}

export function createShow(data: {
  name: string;
  venue: string;
  city: string;
  country: string;
  date: string;
  ticketUrl?: string;
  soldOut?: boolean;
  isPast?: boolean;
  tracklist?: string[];
  flyerUrl?: string;
  sortOrder?: number;
}) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO shows (id, name, venue, city, country, date, ticket_url, sold_out, is_past, tracklist, flyer_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.venue,
    data.city,
    data.country,
    data.date,
    data.ticketUrl || null,
    data.soldOut ? 1 : 0,
    data.isPast ? 1 : 0,
    data.tracklist ? JSON.stringify(data.tracklist) : null,
    data.flyerUrl || null,
    data.sortOrder ?? 0,
  );
  return getShowById(id)!;
}

export function updateShow(id: string, data: {
  name?: string;
  venue?: string;
  city?: string;
  country?: string;
  date?: string;
  ticketUrl?: string | null;
  soldOut?: boolean;
  isPast?: boolean;
  tracklist?: string[] | null;
  flyerUrl?: string | null;
  sortOrder?: number;
}) {
  const existing = db.prepare("SELECT * FROM shows WHERE id = ?").get(id) as DBShow | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE shows SET name = ?, venue = ?, city = ?, country = ?, date = ?, ticket_url = ?, sold_out = ?, is_past = ?, tracklist = ?, flyer_url = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    data.name ?? existing.name,
    data.venue ?? existing.venue,
    data.city ?? existing.city,
    data.country ?? existing.country,
    data.date ?? existing.date,
    data.ticketUrl !== undefined ? data.ticketUrl : existing.ticket_url,
    data.soldOut !== undefined ? (data.soldOut ? 1 : 0) : existing.sold_out,
    data.isPast !== undefined ? (data.isPast ? 1 : 0) : existing.is_past,
    data.tracklist !== undefined ? (data.tracklist ? JSON.stringify(data.tracklist) : null) : existing.tracklist,
    data.flyerUrl !== undefined ? data.flyerUrl : existing.flyer_url,
    data.sortOrder ?? existing.sort_order,
    id,
  );
  return getShowById(id);
}

export function deleteShow(id: string): boolean {
  const result = db.prepare("DELETE FROM shows WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Releases CRUD ---

interface DBRelease {
  id: string;
  title: string;
  type: string;
  release_date: string;
  cover_url: string;
  audio_url: string | null;
  spotify_url: string | null;
  spotify_embed_id: string | null;
  featured: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRelease(row: DBRelease) {
  return {
    id: row.id,
    title: row.title,
    type: row.type as "single" | "ep" | "album" | "remix",
    releaseDate: row.release_date,
    coverUrl: row.cover_url,
    audioUrl: row.audio_url || undefined,
    spotifyUrl: row.spotify_url || undefined,
    spotifyEmbedId: row.spotify_embed_id || undefined,
    featured: row.featured === 1,
    sortOrder: row.sort_order,
  };
}

export function getReleases() {
  const rows = db.prepare("SELECT * FROM releases ORDER BY sort_order ASC, release_date DESC").all() as DBRelease[];
  return rows.map(mapRelease);
}

export function getReleaseById(id: string) {
  const row = db.prepare("SELECT * FROM releases WHERE id = ?").get(id) as DBRelease | undefined;
  return row ? mapRelease(row) : null;
}

export function createRelease(data: {
  title: string;
  type: string;
  releaseDate: string;
  coverUrl: string;
  audioUrl?: string;
  spotifyUrl?: string;
  spotifyEmbedId?: string;
  featured?: boolean;
  sortOrder?: number;
}) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO releases (id, title, type, release_date, cover_url, audio_url, spotify_url, spotify_embed_id, featured, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.title,
    data.type,
    data.releaseDate,
    data.coverUrl,
    data.audioUrl || null,
    data.spotifyUrl || null,
    data.spotifyEmbedId || null,
    data.featured ? 1 : 0,
    data.sortOrder ?? 0,
  );
  return getReleaseById(id)!;
}

export function updateRelease(id: string, data: {
  title?: string;
  type?: string;
  releaseDate?: string;
  coverUrl?: string;
  audioUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyEmbedId?: string | null;
  featured?: boolean;
  sortOrder?: number;
}) {
  const existing = db.prepare("SELECT * FROM releases WHERE id = ?").get(id) as DBRelease | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE releases SET title = ?, type = ?, release_date = ?, cover_url = ?, audio_url = ?, spotify_url = ?, spotify_embed_id = ?, featured = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    data.title ?? existing.title,
    data.type ?? existing.type,
    data.releaseDate ?? existing.release_date,
    data.coverUrl ?? existing.cover_url,
    data.audioUrl !== undefined ? data.audioUrl : existing.audio_url,
    data.spotifyUrl !== undefined ? data.spotifyUrl : existing.spotify_url,
    data.spotifyEmbedId !== undefined ? data.spotifyEmbedId : existing.spotify_embed_id,
    data.featured !== undefined ? (data.featured ? 1 : 0) : existing.featured,
    data.sortOrder ?? existing.sort_order,
    id,
  );
  return getReleaseById(id);
}

export function deleteRelease(id: string): boolean {
  const result = db.prepare("DELETE FROM releases WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Migrate local audio URLs to R2 ---

export function migrateUrlsToR2() {
  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!r2Base) return { migrated: 0 };

  let migrated = 0;

  // Only migrate audio_url — covers are served from public/covers/
  const releases = db.prepare("SELECT id, audio_url FROM releases").all() as { id: string; audio_url: string | null }[];

  for (const r of releases) {
    if (r.audio_url && r.audio_url.startsWith("/audio/")) {
      const audioUrl = `${r2Base}${r.audio_url}`;
      db.prepare("UPDATE releases SET audio_url = ?, updated_at = datetime('now') WHERE id = ?").run(audioUrl, r.id);
      migrated++;
    }
  }

  return { migrated };
}

// --- Seed from static config ---

export function seedFromStaticConfig() {
  const showCount = (db.prepare("SELECT COUNT(*) as count FROM shows").get() as { count: number }).count;
  const releaseCount = (db.prepare("SELECT COUNT(*) as count FROM releases").get() as { count: number }).count;

  let seededShows = 0;
  let seededReleases = 0;

  if (showCount === 0) {
    for (let i = 0; i < siteConfig.shows.upcoming.length; i++) {
      const show = siteConfig.shows.upcoming[i];
      createShow({
        name: show.name,
        venue: show.venue,
        city: show.city,
        country: show.country,
        date: show.date,
        ticketUrl: show.ticketUrl,
        soldOut: show.soldOut,
        isPast: false,
        sortOrder: i,
      });
      seededShows++;
    }
    for (let i = 0; i < siteConfig.shows.past.length; i++) {
      const set = siteConfig.shows.past[i];
      createShow({
        name: set.name,
        venue: set.venue,
        city: set.city,
        country: set.country,
        date: set.date,
        isPast: true,
        tracklist: set.tracklist,
        sortOrder: i,
      });
      seededShows++;
    }
  }

  if (releaseCount === 0) {
    for (let i = 0; i < siteConfig.releases.length; i++) {
      const r = siteConfig.releases[i];
      createRelease({
        title: r.title,
        type: r.type,
        releaseDate: r.releaseDate,
        coverUrl: r.coverUrl,
        audioUrl: r.audioUrl,
        spotifyUrl: r.spotifyUrl,
        spotifyEmbedId: r.spotifyEmbedId,
        featured: r.featured,
        sortOrder: i,
      });
      seededReleases++;
    }
  }

  // Always migrate local URLs to R2 if configured
  const { migrated } = migrateUrlsToR2();

  return { seededShows, seededReleases, migratedToR2: migrated };
}
