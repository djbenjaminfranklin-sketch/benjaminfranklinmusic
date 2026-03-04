import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getUserByProvider,
  getUserByEmail,
  createOAuthUser,
  linkProviderToUser,
  createSession,
  promoteToAdmin,
} from "@/shared/lib/db";
import { createJWT, setAuthCookie } from "@/features/auth/lib/auth";

// Convert JWK to PEM for Apple's public keys
function jwkToPem(jwk: { n: string; e: string }): string {
  const n = Buffer.from(jwk.n, "base64url");
  const e = Buffer.from(jwk.e, "base64url");

  // ASN.1 DER encoding for RSA public key
  const encodedN = n[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), n]) : n;
  const encodedE = e[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), e]) : e;

  function asn1Length(length: number): Buffer {
    if (length < 128) return Buffer.from([length]);
    if (length < 256) return Buffer.from([0x81, length]);
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }

  function asn1Integer(data: Buffer): Buffer {
    const header = Buffer.concat([Buffer.from([0x02]), asn1Length(data.length)]);
    return Buffer.concat([header, data]);
  }

  const nInt = asn1Integer(encodedN);
  const eInt = asn1Integer(encodedE);
  const seq = Buffer.concat([
    Buffer.from([0x30]),
    asn1Length(nInt.length + eInt.length),
    nInt,
    eInt,
  ]);

  // RSA OID: 1.2.840.113549.1.1.1
  const oid = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);

  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    asn1Length(seq.length + 1),
    Buffer.from([0x00]),
    seq,
  ]);

  const pubKeyDer = Buffer.concat([
    Buffer.from([0x30]),
    asn1Length(oid.length + bitString.length),
    oid,
    bitString,
  ]);

  const pem = `-----BEGIN PUBLIC KEY-----\n${pubKeyDer.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
  return pem;
}

// Verify Apple id_token using Apple's public keys
async function verifyAppleIdToken(idToken: string): Promise<{
  sub: string;
  email?: string;
  email_verified?: string | boolean;
}> {
  const [headerB64] = idToken.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());

  // Fetch Apple's public keys
  const keysRes = await fetch("https://appleid.apple.com/auth/keys");
  const { keys } = await keysRes.json();
  const key = keys.find((k: { kid: string }) => k.kid === header.kid);
  if (!key) throw new Error("Apple public key not found");

  const pem = jwkToPem(key);
  const publicKey = crypto.createPublicKey(pem);

  // Verify JWT signature
  const [headerPart, payloadPart, signaturePart] = idToken.split(".");
  const data = `${headerPart}.${payloadPart}`;
  const signature = Buffer.from(signaturePart, "base64url");

  const isValid = crypto.createVerify("RSA-SHA256").update(data).verify(publicKey, signature);
  if (!isValid) throw new Error("Invalid Apple token signature");

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString());

  // Verify claims
  const clientId = process.env.APPLE_CLIENT_ID!;
  if (payload.iss !== "https://appleid.apple.com") throw new Error("Invalid issuer");
  if (payload.aud !== clientId) throw new Error("Invalid audience");
  if (payload.exp * 1000 < Date.now()) throw new Error("Token expired");

  return payload;
}

export async function POST(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://benjaminfranklinmusic.onrender.com";

  try {
    const formData = await request.formData();
    const idToken = formData.get("id_token") as string;
    const state = formData.get("state") as string;
    const userJson = formData.get("user") as string | null;
    const storedState = request.cookies.get("oauth-state")?.value;

    if (!idToken || !state || state !== storedState) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=invalid_state`, { status: 303 });
    }

    const claims = await verifyAppleIdToken(idToken);
    const appleUserId = claims.sub;

    // Apple provides name only on first authorization
    let userName = "Apple User";
    if (userJson) {
      try {
        const userData = JSON.parse(userJson);
        const first = userData.name?.firstName || "";
        const last = userData.name?.lastName || "";
        userName = `${first} ${last}`.trim() || userName;
      } catch {
        // ignore parse error
      }
    }

    const email = claims.email?.toLowerCase();

    // 1. Check by provider_id
    let user = getUserByProvider("apple", appleUserId);

    // 2. Check by email (auto-link) — skip for Hide My Email relay addresses
    if (!user && email && !email.endsWith("@privaterelay.appleid.com")) {
      const existingUser = getUserByEmail(email);
      if (existingUser) {
        linkProviderToUser(existingUser.id, "apple", appleUserId);
        user = existingUser;
      }
    }

    // 3. Create new user
    if (!user) {
      const userEmail = email || `apple_${appleUserId.slice(0, 8)}@privaterelay.appleid.com`;
      user = createOAuthUser(userEmail, userName, "apple", appleUserId);
    }

    if (user.banned === 1) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=account_suspended`, { status: 303 });
    }

    // Auto-promote admin emails
    if (email) {
      const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (adminEmails.includes(email) && user.role !== "admin") {
        promoteToAdmin(user.id);
      }
    }

    const session = createSession(user.id);
    const token = createJWT({ userId: user.id, sessionId: session.id });

    const response = NextResponse.redirect(`${baseUrl}/`, { status: 303 });
    response.cookies.delete("oauth-state");
    return setAuthCookie(response, token);
  } catch {
    return NextResponse.redirect(`${baseUrl}/?auth_error=apple_failed`, { status: 303 });
  }
}
