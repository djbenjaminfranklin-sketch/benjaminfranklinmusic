import http2 from "http2";
import tls from "tls";
import { getDeviceTokens, deleteDeviceToken } from "@/shared/lib/db";

// Certificate-based auth (.p12 stored as base64 in env)
const APNS_CERT_P12_B64 = process.env.APNS_CERT_P12 || "";
const APNS_CERT_PASSWORD = process.env.APNS_CERT_PASSWORD || "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.benjaminfranklin.app";
const APNS_PRODUCTION = process.env.APNS_PRODUCTION === "true";

const APNS_HOST = APNS_PRODUCTION
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

let tlsContext: tls.SecureContext | null = null;

function getTLSContext(): tls.SecureContext | null {
  if (tlsContext) return tlsContext;
  if (!APNS_CERT_P12_B64) return null;

  try {
    const pfx = Buffer.from(APNS_CERT_P12_B64, "base64");
    tlsContext = tls.createSecureContext({
      pfx,
      passphrase: APNS_CERT_PASSWORD || undefined,
    });
    console.log("[apns] TLS context created from certificate");
    return tlsContext;
  } catch (err) {
    console.error("[apns] Failed to create TLS context:", err);
    return null;
  }
}

async function sendAPNs(token: string, payload: object): Promise<boolean> {
  const ctx = getTLSContext();
  if (!ctx) return false;

  return new Promise((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}`, {
      secureContext: ctx,
    });
    client.on("error", () => { client.close(); resolve(false); });

    const headers = {
      ":method": "POST" as const,
      ":path": `/3/device/${token}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    };

    const req = client.request(headers);
    let status = 0;

    req.on("response", (h) => { status = h[":status"] as number; });

    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });

    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve(true);
      } else {
        console.error(`[apns] Send failed (${status}) for ${token.slice(0, 8)}...: ${body}`);
        if (status === 410 || (status === 400 && body.includes("BadDeviceToken"))) {
          deleteDeviceToken(token);
        }
        resolve(false);
      }
    });

    req.on("error", () => { client.close(); resolve(false); });
    req.end(JSON.stringify(payload));
  });
}

export async function sendAPNsToAll(title: string, body: string, image?: string): Promise<number> {
  const tokens = getDeviceTokens();
  if (tokens.length === 0) {
    console.log("[apns] No device tokens found, skipping");
    return 0;
  }

  const ctx = getTLSContext();
  if (!ctx) {
    console.warn("[apns] APNs not configured (missing APNS_CERT_P12 env variable)");
    return 0;
  }

  const payload = {
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
      ...(image ? { "mutable-content": 1 } : {}),
    },
    ...(image ? { imageUrl: image } : {}),
  };

  let successCount = 0;
  await Promise.allSettled(
    tokens.map(async (t) => {
      if (await sendAPNs(t.token, payload)) successCount++;
    })
  );

  console.log(`[apns] sendAPNsToAll: ${successCount}/${tokens.length} delivered`);
  return successCount;
}
