import http2 from "http2";
import tls from "tls";
import { getDeviceTokens, deleteDeviceToken } from "@/shared/lib/db";

// PEM-based auth (cert + key stored as base64 in env)
const APNS_CERT_PEM_B64 = process.env.APNS_CERT_PEM || "";
const APNS_KEY_PEM_B64 = process.env.APNS_KEY_PEM || "";
// Fallback: PKCS#12 (.p12) auth
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

  try {
    // Prefer PEM cert + key (more reliable)
    if (APNS_CERT_PEM_B64 && APNS_KEY_PEM_B64) {
      const cert = Buffer.from(APNS_CERT_PEM_B64, "base64").toString("utf-8");
      const key = Buffer.from(APNS_KEY_PEM_B64, "base64").toString("utf-8");
      tlsContext = tls.createSecureContext({ cert, key });
      console.log(`[apns] TLS context created from PEM cert+key (host: ${APNS_HOST})`);
      return tlsContext;
    }

    // Fallback to .p12
    if (APNS_CERT_P12_B64) {
      const pfx = Buffer.from(APNS_CERT_P12_B64, "base64");
      tlsContext = tls.createSecureContext({
        pfx,
        passphrase: APNS_CERT_PASSWORD || undefined,
      });
      console.log(`[apns] TLS context created from .p12 (host: ${APNS_HOST})`);
      return tlsContext;
    }

    console.warn("[apns] No certificate configured (need APNS_CERT_PEM+APNS_KEY_PEM or APNS_CERT_P12)");
    return null;
  } catch (err) {
    console.error("[apns] Failed to create TLS context:", err);
    return null;
  }
}

async function sendAPNs(token: string, payload: object): Promise<{ success: boolean; status?: number; error?: string }> {
  const ctx = getTLSContext();
  if (!ctx) return { success: false, error: "No TLS context" };

  return new Promise((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}`, {
      secureContext: ctx,
    });

    const timeout = setTimeout(() => {
      client.close();
      resolve({ success: false, error: "Connection timeout (10s)" });
    }, 10000);

    client.on("error", (err) => {
      clearTimeout(timeout);
      client.close();
      console.error(`[apns] Connection error: ${err.message}`);
      resolve({ success: false, error: `Connection error: ${err.message}` });
    });

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
      clearTimeout(timeout);
      client.close();
      if (status === 200) {
        resolve({ success: true, status: 200 });
      } else {
        console.error(`[apns] Send failed (${status}) for ${token.slice(0, 8)}...: ${body}`);
        if (status === 410 || (status === 400 && body.includes("BadDeviceToken"))) {
          deleteDeviceToken(token);
        }
        resolve({ success: false, status, error: body });
      }
    });

    req.on("error", (err) => {
      clearTimeout(timeout);
      client.close();
      resolve({ success: false, error: `Request error: ${err.message}` });
    });

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
    console.warn("[apns] APNs not configured — no certificate available");
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
  const results: { token: string; result: Awaited<ReturnType<typeof sendAPNs>> }[] = [];

  await Promise.allSettled(
    tokens.map(async (t) => {
      const result = await sendAPNs(t.token, payload);
      results.push({ token: t.token.slice(0, 8), result });
      if (result.success) successCount++;
    })
  );

  console.log(`[apns] sendAPNsToAll: ${successCount}/${tokens.length} delivered`);
  results.forEach((r) => {
    console.log(`[apns]   ${r.token}... → ${r.result.success ? "OK" : `FAIL: ${r.result.status} ${r.result.error}`}`);
  });

  return successCount;
}

/** Diagnostic info for debug endpoint */
export function getAPNsDiagnostics() {
  const tokens = getDeviceTokens();
  const hasPemCert = !!APNS_CERT_PEM_B64;
  const hasPemKey = !!APNS_KEY_PEM_B64;
  const hasP12 = !!APNS_CERT_P12_B64;

  let tlsStatus = "not_configured";
  try {
    const ctx = getTLSContext();
    tlsStatus = ctx ? "ok" : "failed";
  } catch {
    tlsStatus = "error";
  }

  return {
    host: APNS_HOST,
    production: APNS_PRODUCTION,
    bundleId: APNS_BUNDLE_ID,
    auth: hasPemCert && hasPemKey ? "pem" : hasP12 ? "p12" : "none",
    tlsContext: tlsStatus,
    deviceTokens: tokens.length,
    tokens: tokens.map((t) => ({
      token: t.token.slice(0, 12) + "...",
      platform: t.platform,
      createdAt: t.created_at,
    })),
  };
}
