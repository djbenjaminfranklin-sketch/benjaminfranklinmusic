import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getUpcomingShows, getPastShows, createShow } from "@/lib/dynamic-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const upcoming = getUpcomingShows();
  const past = getPastShows();
  return NextResponse.json({ upcoming, past });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, venue, city, country, date, ticketUrl, soldOut, isPast, tracklist, flyerUrl, sortOrder } = body;

    if (!name || !venue || !city || !country || !date) {
      return NextResponse.json({ error: "name, venue, city, country, and date are required" }, { status: 400 });
    }

    const show = createShow({ name, venue, city, country, date, ticketUrl, soldOut, isPast, tracklist, flyerUrl, sortOrder });
    return NextResponse.json(show, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create show" }, { status: 500 });
  }
}
