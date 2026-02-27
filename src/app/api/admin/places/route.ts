import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/auth/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Places not configured" },
        { status: 503 }
      );
    }

    const query = request.nextUrl.searchParams.get("query");
    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", query);
    url.searchParams.set("types", "establishment");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();

    const predictions = (data.predictions || []).map((p: { structured_formatting?: { main_text?: string; secondary_text?: string }; place_id?: string; description?: string }) => ({
      name: p.structured_formatting?.main_text || p.description || "",
      address: p.structured_formatting?.secondary_text || "",
      placeId: p.place_id || "",
    }));

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json(
      { error: "Failed to search places" },
      { status: 500 }
    );
  }
}
