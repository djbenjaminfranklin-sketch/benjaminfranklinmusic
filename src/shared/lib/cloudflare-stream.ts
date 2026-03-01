/**
 * Cloudflare Stream API utilities.
 * Uses WHIP for ingest, HLS for viewer playback.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

export function isCloudflareConfigured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_STREAM_API_TOKEN
  );
}

interface LiveInput {
  uid: string;
  whipUrl: string;
  whepUrl: string;
  hlsUrl: string;
}

/**
 * Create a Cloudflare Stream Live Input.
 * Returns the uid, WHIP ingest URL, and HLS playback URL.
 */
export async function createLiveInput(): Promise<LiveInput> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!accountId || !token) {
    throw new Error("Cloudflare Stream not configured");
  }

  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meta: { name: `live-${Date.now()}` },
      recording: { mode: "automatic" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudflare createLiveInput failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const result = json.result;

  console.log("[Cloudflare] Live Input created:", JSON.stringify({
    uid: result.uid,
    webRTC: result.webRTC,
    webRTCPlayback: result.webRTCPlayback,
    keys: Object.keys(result),
  }));

  const whipUrl = result.webRTC?.url;
  if (!whipUrl) {
    console.error("[Cloudflare] No WHIP URL! Keys:", Object.keys(result));
  }

  // HLS playback URL — extract customer subdomain from WHEP URL if available,
  // otherwise use videodelivery.net which works without a subdomain.
  let hlsUrl: string;
  const whepUrl = result.webRTCPlayback?.url as string | undefined;
  if (whepUrl) {
    // Extract base from: https://customer-xxx.cloudflarestream.com/{uid}/webRTC/play
    const base = whepUrl.replace(/\/webRTC\/play$/, "");
    hlsUrl = `${base}/manifest/video.m3u8`;
  } else {
    // Fallback: videodelivery.net works for any Cloudflare Stream video
    hlsUrl = `https://videodelivery.net/${result.uid}/manifest/video.m3u8`;
  }

  console.log("[Cloudflare] WHIP URL:", whipUrl);
  console.log("[Cloudflare] HLS URL:", hlsUrl);

  return {
    uid: result.uid,
    whipUrl: whipUrl || `${CF_API}/accounts/${accountId}/stream/live_inputs/${result.uid}/webRTC`,
    whepUrl: whepUrl || `https://customer-${accountId}.cloudflarestream.com/${result.uid}/webRTC/play`,
    hlsUrl,
  };
}

/**
 * Check a Cloudflare Stream Live Input status.
 */
export async function getLiveInputStatus(uid: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!accountId || !token) return null;

  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return { error: res.status };

  const json = await res.json();
  return json.result;
}

/**
 * Delete a Cloudflare Stream Live Input.
 */
export async function deleteLiveInput(uid: string): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!accountId || !token) return;

  await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${uid}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
