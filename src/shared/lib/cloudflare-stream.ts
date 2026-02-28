/**
 * Cloudflare Stream API utilities.
 * Uses WHIP for ingest and WHEP for delivery (WebRTC both ways).
 * Note: Cloudflare WHIP does NOT support HLS playback — WHEP is required.
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
}

/**
 * Create a Cloudflare Stream Live Input.
 * Returns the uid, WHIP ingest URL, and WHEP playback URL.
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
      recording: { mode: "off" },
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
    rtmps: result.rtmps ? "present" : "absent",
  }));

  const whipUrl = result.webRTC?.url;
  const whepUrl = result.webRTCPlayback?.url;

  if (!whipUrl) {
    console.error("[Cloudflare] No WHIP URL returned! Full result keys:", Object.keys(result));
  }
  if (!whepUrl) {
    console.error("[Cloudflare] No WHEP URL returned! Full result keys:", Object.keys(result));
  }

  return {
    uid: result.uid,
    whipUrl: whipUrl || `${CF_API}/accounts/${accountId}/stream/live_inputs/${result.uid}/webRTC`,
    whepUrl: whepUrl || `https://${process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN || `customer-${accountId}`}.cloudflarestream.com/${result.uid}/webRTC/play`,
  };
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
