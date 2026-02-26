import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, "app.db"));

// During Next.js build, 15 Turbopack workers import this module simultaneously.
// All DB init (pragmas + schema) is wrapped in try-catch because any write operation
// can throw SQLITE_BUSY when another worker holds the lock.
// Tables use IF NOT EXISTS, and pragmas are idempotent, so this is safe.
try {
  // Set busy_timeout first (connection-level, no lock) so subsequent ops wait
  db.pragma("busy_timeout = 30000");
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'fan',
      created_at TEXT DEFAULT (datetime('now')),
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channels TEXT NOT NULL,
      sent_by TEXT NOT NULL REFERENCES users(id),
      sent_at TEXT DEFAULT (datetime('now')),
      recipient_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      venue TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      date TEXT NOT NULL,
      ticket_url TEXT,
      sold_out INTEGER DEFAULT 0,
      is_past INTEGER DEFAULT 0,
      tracklist TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      release_date TEXT NOT NULL,
      cover_url TEXT NOT NULL,
      audio_url TEXT,
      spotify_url TEXT,
      spotify_embed_id TEXT,
      featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
} catch (e: unknown) {
  const err = e as { code?: string };
  if (err?.code !== "SQLITE_BUSY") throw e;
  // SQLITE_BUSY during build is safe — another worker completed the init.
  // Ensure busy_timeout is set for runtime queries even if init was skipped.
  try { db.pragma("busy_timeout = 30000"); } catch {}
  try { db.pragma("foreign_keys = ON"); } catch {}
}

// --- Types ---

export interface DBUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: string;
  email_verified: number;
}

export interface DBSession {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface DBPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface DBBroadcast {
  id: string;
  title: string;
  message: string;
  channels: string;
  sent_by: string;
  sent_at: string;
  recipient_count: number;
}

// --- Users ---

export function createUser(email: string, passwordHash: string, name: string, role = "fan"): DBUser {
  const id = crypto.randomUUID();
  const stmt = db.prepare(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(id, email, passwordHash, name, role);
  return getUserById(id)!;
}

export function getUserByEmail(email: string): DBUser | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as DBUser | undefined;
}

export function getUserById(id: string): DBUser | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DBUser | undefined;
}

export function getAllUsers(): DBUser[] {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as DBUser[];
}

export function promoteToAdmin(userId: string): void {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
}

export function getUserCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

// --- Sessions ---

export function createSession(userId: string): DBSession {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(id, userId, expiresAt);
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as DBSession;
}

export function getSession(id: string): DBSession | undefined {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as DBSession | undefined;
  if (session && new Date(session.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return undefined;
  }
  return session;
}

export function deleteSession(id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

// --- Push Subscriptions ---

export function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): DBPushSubscription {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, endpoint, p256dh, auth);
  return db.prepare("SELECT * FROM push_subscriptions WHERE id = ?").get(id) as DBPushSubscription;
}

export function getPushSubscriptions(): DBPushSubscription[] {
  return db.prepare("SELECT * FROM push_subscriptions").all() as DBPushSubscription[];
}

export function deletePushSubscription(endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

// --- Broadcasts ---

export function createBroadcast(
  title: string,
  message: string,
  channels: string[],
  sentBy: string,
  recipientCount: number
): DBBroadcast {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO broadcasts (id, title, message, channels, sent_by, recipient_count) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, title, message, JSON.stringify(channels), sentBy, recipientCount);
  return db.prepare("SELECT * FROM broadcasts WHERE id = ?").get(id) as DBBroadcast;
}

export function getBroadcasts(): DBBroadcast[] {
  return db.prepare("SELECT * FROM broadcasts ORDER BY sent_at DESC").all() as DBBroadcast[];
}

export function getBroadcastCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM broadcasts").get() as { count: number };
  return row.count;
}

export function getPushSubscriptionCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM push_subscriptions").get() as { count: number };
  return row.count;
}

export default db;
