import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";
import { createShow } from "@/shared/lib/dynamic-config";

export const dynamic = "force-dynamic";

interface IncomingShow {
  name?: string;
  venue?: string;
  city?: string;
  country?: string;
  date?: string;
  ticketUrl?: string;
  soldOut?: boolean;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { shows?: IncomingShow[]; isPast?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shows = Array.isArray(body.shows) ? body.shows : [];
  const isPast = Boolean(body.isPast);

  if (shows.length === 0) {
    return NextResponse.json({ error: "Aucune date à importer." }, { status: 400 });
  }

  let created = 0;
  const skipped: number[] = [];

  // Bulk insert — intentionally no push notification per show (would spam users).
  shows.forEach((s, i) => {
    if (!s.name || !s.venue || !s.city || !s.country || !s.date) {
      skipped.push(i);
      return;
    }
    const iso = new Date(s.date).toISOString();
    if (isNaN(new Date(s.date).getTime())) {
      skipped.push(i);
      return;
    }
    createShow({
      name: s.name,
      venue: s.venue,
      city: s.city,
      country: s.country,
      date: iso,
      ticketUrl: s.ticketUrl || undefined,
      soldOut: Boolean(s.soldOut),
      isPast,
    });
    created += 1;
  });

  return NextResponse.json({ created, skipped: skipped.length });
}
