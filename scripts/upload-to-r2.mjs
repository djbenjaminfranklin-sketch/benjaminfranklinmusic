#!/usr/bin/env node

/**
 * Upload all audio files from public/audio/ to Cloudflare R2.
 *
 * Required env vars (set them or create a .env file):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME          (default: benjamin-franklin-audio)
 *   R2_PUBLIC_URL            (e.g. https://pub-xxx.r2.dev)
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { lookup } from "node:dns";

const AUDIO_DIR = new URL("../public/audio", import.meta.url).pathname;

const BUCKET = process.env.R2_BUCKET_NAME || "benjamin-franklin-audio";
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxx.r2.dev

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

if (!PUBLIC_URL) {
  console.error("Missing R2_PUBLIC_URL (e.g. https://pub-xxx.r2.dev)");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});

function mimeType(filename) {
  if (filename.endsWith(".mp3")) return "audio/mpeg";
  if (filename.endsWith(".wav")) return "audio/wav";
  if (filename.endsWith(".ogg")) return "audio/ogg";
  if (filename.endsWith(".flac")) return "audio/flac";
  return "application/octet-stream";
}

async function main() {
  const files = await readdir(AUDIO_DIR);
  const audioFiles = files.filter((f) => /\.(mp3|wav|ogg|flac)$/i.test(f));

  console.log(`Found ${audioFiles.length} audio files in ${AUDIO_DIR}\n`);

  let uploaded = 0;
  for (const file of audioFiles) {
    const filePath = join(AUDIO_DIR, file);
    const body = await readFile(filePath);
    const key = `audio/${file}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: mimeType(file),
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      const publicUrl = `${PUBLIC_URL}/${key}`;
      console.log(`  ✓ ${file} → ${publicUrl}`);
      uploaded++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${uploaded}/${audioFiles.length} uploaded.`);
}

main();
