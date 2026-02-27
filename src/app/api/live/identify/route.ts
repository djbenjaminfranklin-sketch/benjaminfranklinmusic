import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const host = process.env.ACRCLOUD_HOST?.trim();
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY?.trim();
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();

    if (!host || !accessKey || !accessSecret) {
      console.error("[ACRCloud] Missing env vars:", { host: !!host, accessKey: !!accessKey, accessSecret: !!accessSecret });
      return NextResponse.json(
        { error: "ACRCloud not configured" },
        { status: 503 }
      );
    }

    let audioBuffer: Buffer;

    // Support both JSON (base64) and FormData
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json();
      if (!json.audio_data) {
        return NextResponse.json({ error: "audio_data is required" }, { status: 400 });
      }
      audioBuffer = Buffer.from(json.audio_data, "base64");
      console.log("[ACRCloud] Received base64 audio, size:", audioBuffer.length);
    } else {
      const body = await request.formData();
      const audioFile = body.get("audio") as File | null;
      if (!audioFile) {
        return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
      }
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    }

    if (audioBuffer.length < 1000) {
      console.error("[ACRCloud] Audio too small:", audioBuffer.length);
      return NextResponse.json({ error: "Audio too small" }, { status: 400 });
    }

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
    formData.append("sample", new Blob([new Uint8Array(audioBuffer)]), "audio.wav");
    formData.append("sample_bytes", audioBuffer.length.toString());
    formData.append("access_key", accessKey);
    formData.append("data_type", dataType);
    formData.append("signature_version", signatureVersion);
    formData.append("signature", signature);
    formData.append("timestamp", timestamp);

    console.log("[ACRCloud] Sending to", host, "sample_bytes:", audioBuffer.length, "key:", accessKey?.slice(0, 8) + "...", "secret_len:", accessSecret?.length);

    const res = await fetch(`https://${host}/v1/identify`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
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

    // No track found — ACRCloud returns code 0 + "Success" even when no match
    console.log("[ACRCloud] No match. Status code:", data.status?.code, "msg:", data.status?.msg);

    return NextResponse.json(
      { error: "not_found" },
      { status: 404 }
    );
  } catch (err) {
    console.error("[ACRCloud] Error:", err);
    return NextResponse.json(
      { error: "Failed to identify track" },
      { status: 500 }
    );
  }
}
