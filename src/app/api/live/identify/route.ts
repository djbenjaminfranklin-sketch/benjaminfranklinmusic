import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const host = process.env.ACRCLOUD_HOST;
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;

    if (!host || !accessKey || !accessSecret) {
      console.error("[ACRCloud] Missing env vars:", { host: !!host, accessKey: !!accessKey, accessSecret: !!accessSecret });
      return NextResponse.json(
        { error: "ACRCloud not configured" },
        { status: 503 }
      );
    }

    const body = await request.formData();
    const audioFile = body.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const httpMethod = "POST";
    const httpUri = "/v1/identify";
    const dataType = "audio";
    const signatureVersion = "1";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join("\n");
    const signature = crypto
      .createHmac("sha1", accessSecret)
      .update(stringToSign)
      .digest("base64");

    const formData = new FormData();
    formData.append("sample", new Blob([audioBuffer]), "audio.wav");
    formData.append("sample_bytes", audioBuffer.length.toString());
    formData.append("access_key", accessKey);
    formData.append("data_type", dataType);
    formData.append("signature_version", signatureVersion);
    formData.append("signature", signature);
    formData.append("timestamp", timestamp);

    const res = await fetch(`https://${host}/v1/identify`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    // Debug: log full ACRCloud response to investigate detection issues
    console.log("[ACRCloud] Response:", JSON.stringify(data, null, 2));

    if (data.status?.code === 0 && data.metadata?.music?.length > 0) {
      const track = data.metadata.music[0];
      return NextResponse.json({
        artist: track.artists?.[0]?.name || "Unknown",
        title: track.title || "Unknown",
        album: track.album?.name || "",
        spotify_url: track.external_metadata?.spotify?.track?.id
          ? `https://open.spotify.com/track/${track.external_metadata.spotify.track.id}`
          : null,
      });
    }

    return NextResponse.json(
      { error: "No track identified" },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to identify track" },
      { status: 500 }
    );
  }
}
