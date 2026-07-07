import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/features/auth/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// JSON schema forcing Claude to return a clean, typed list of shows.
const SHOWS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Event / night / party name. Use the venue name if there is no distinct event name." },
          venue: { type: "string", description: "Club, venue or festival name. Empty string if unknown." },
          city: { type: "string", description: "City. Empty string if unknown." },
          country: { type: "string", description: "Country. Empty string if unknown." },
          date: { type: "string", description: "Date in ISO format YYYY-MM-DD." },
          ticketUrl: { type: "string", description: "Ticket link if present, else empty string." },
          soldOut: { type: "boolean", description: "true only if explicitly marked sold out / complet / agotado." },
        },
        required: ["name", "venue", "city", "country", "date", "ticketUrl", "soldOut"],
      },
    },
  },
  required: ["shows"],
} as const;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Import IA non configuré (ANTHROPIC_API_KEY manquante)." },
      { status: 500 }
    );
  }

  // Build the user content: either a pasted text, or an uploaded PDF / image.
  const contentType = request.headers.get("content-type") || "";
  const userContent: Anthropic.ContentBlockParam[] = [];

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const text = (body?.text || "").toString().trim();
      if (!text) {
        return NextResponse.json({ error: "Aucun texte fourni." }, { status: 400 });
      }
      userContent.push({ type: "text", text: `Voici ma liste de dates :\n\n${text}` });
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
      }
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const mime = file.type || "";

      if (mime === "application/pdf") {
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: b64 },
        });
      } else if ((IMAGE_TYPES as readonly string[]).includes(mime)) {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mime as (typeof IMAGE_TYPES)[number],
            data: b64,
          },
        });
      } else {
        return NextResponse.json(
          { error: "Format non supporté. Utilise un PDF, une image (PNG/JPG) ou colle du texte." },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  userContent.push({
    type: "text",
    text:
      `Extrais TOUTES les dates de concerts / DJ sets / soirées / dates de résidence de ce document. ` +
      `Aujourd'hui nous sommes le ${today}. Si une année n'est pas précisée, choisis l'occurrence future la plus proche. ` +
      `Renseigne venue/ville/pays au mieux ; laisse une chaîne vide si l'information est absente (n'invente rien). ` +
      `Ignore tout ce qui n'est pas une date de show.`,
  });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: SHOWS_SCHEMA } },
      messages: [{ role: "user", content: userContent }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Le document n'a pas pu être analysé." }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = JSON.parse(raw || "{}");
    const shows = Array.isArray(parsed?.shows) ? parsed.shows : [];

    return NextResponse.json({ shows });
  } catch (err) {
    console.error("Show import failed:", err);
    return NextResponse.json({ error: "Échec de l'analyse du document." }, { status: 500 });
  }
}
