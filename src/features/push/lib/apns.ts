import http2 from "http2";
import crypto from "crypto";
import { getDeviceTokens, deleteDeviceToken } from "@/shared/lib/db";

const APNS_KEY_ID = process.env.APNS_KEY_ID || "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || "";
const APNS_KEY = process.env.APNS_KEY || ""; // .p8 key content (base64 or PEM)
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.benjaminfranklin.app";
const APNS_PRODUCTION = process.env.APNS_PRODUCTION === "true";

const APNS_HOST = APNS_PRODUCTION
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

let cachedJWT: { token: string; expires: number } | null = null;

function getAPNsJWT(): string | null {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY) return null;

  // Reuse token if still valid (tokens last 1 hour, refresh at 50 min)
  if (cachedJWT && Date.now() < cachedJWT.expires) return cachedJWT.token;

  try {
    // Decode the key (handle both raw PEM and base64-encoded)
    let keyContent = APNS_KEY;
    if (!keyContent.includes("-----BEGIN PRIVATE KEY-----")) {
      keyContent = `-----BEGIN PRIVATE KEY-----\n${keyContent}\n-----END PRIVATE KEY-----`;
    }

    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })).toString("base64url");
    const signingInput = `${header}.${claims}`;

    const sign = crypto.createSign("SHA256");
    sign.update(signingInput);
    const signature = sign.sign(keyContent);

    // Convert DER signature to raw r||s format for ES256
    const r = extractDERInt(signature, 3);
    const s = extractDERInt(signature, 3 + 1 + signature[3] + 1);
    const rawSig = Buffer.concat([padTo32(r), padTo32(s)]).toString("base64url");

    const jwt = `${signingInput}.${rawSig}`;
    cachedJWT = { token: jwt, expires: Date.now() + 50 * 60 * 1000 };
    return jwt;
  } catch (err) {
    console.error("[apns] Failed to create JWT:", err);
    return null;
  }
}

function extractDERInt(buf: Buffer, offset: number): Buffer {
  const len = buf[offset + 1];
  return buf.subarray(offset + 2, offset + 2 + len);
}

function padTo32(buf: Buffer): Buffer {
  if (buf.length === 33 && buf[0] === 0) return buf.subarray(1);
  if (buf.length === 32) return buf;
  const padded = Buffer.alloc(32);
  buf.copy(padded, 32 - buf.length);
  return padded;
}

async function sendAPNs(token: string, payload: object): Promise<boolean> {
  const jwt = getAPNsJWT();
  if (!jwt) return false;

  return new Promise((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    client.on("error", () => { client.close(); resolve(false); });

    const headers = {
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "authorization": `bearer ${jwt}`,
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
        // Remove invalid tokens
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

  const jwt = getAPNsJWT();
  if (!jwt) {
    console.warn("[apns] APNs not configured (missing APNS_KEY_ID, APNS_TEAM_ID, or APNS_KEY)");
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
