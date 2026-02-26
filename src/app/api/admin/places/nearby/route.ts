import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google Places not configured" }, { status: 503 });
    }

    const lat = request.nextUrl.searchParams.get("lat");
    const lng = request.nextUrl.searchParams.get("lng");
    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
    }

    // Search for nearby establishments (100m radius, closest business)
    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", "100");
    url.searchParams.set("type", "establishment");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();

    const places = (data.results || []).slice(0, 3).map((p: { name?: string; vicinity?: string; place_id?: string }) => ({
      name: p.name || "",
      address: p.vicinity || "",
      placeId: p.place_id || "",
    }));

    // Fallback: if no places found, reverse geocode to get street address
    if (places.length === 0) {
      const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      geoUrl.searchParams.set("latlng", `${lat},${lng}`);
      geoUrl.searchParams.set("key", apiKey);
      const geoRes = await fetch(geoUrl.toString());
      const geoData = await geoRes.json();
      if (geoData.results?.length > 0) {
        const addr = geoData.results[0].formatted_address || "";
        // Use short address (remove country/postal code for cleaner display)
        const shortAddr = addr.split(",").slice(0, 2).join(",").trim();
        return NextResponse.json({ places: [{ name: shortAddr, address: addr, placeId: "" }] });
      }
    }

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: "Failed to search nearby places" }, { status: 500 });
  }
}
