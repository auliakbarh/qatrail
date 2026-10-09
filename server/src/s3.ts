import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

// Attachment upload to a public-read S3 bucket, same shape as mbo-api's
// AWSService.uploadFile — except the bytes go browser → S3 on a presigned PUT,
// so a 50MB video never passes through express (2mb body limit) or nginx.
// The bucket needs a CORS rule allowing PUT from the app's origin.

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const PREFIX = "qatrail";

let client: S3Client | null = null;

export function s3Enabled(): boolean {
  const c = env.s3;
  return Boolean(c.region && c.accessKeyId && c.secretAccessKey && c.bucket);
}

/** Keep the original name readable in the URL, without anything that breaks a key. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-120) || "file";
}

export function publicUrl(key: string): string {
  return `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;
}

export async function presignUpload(fileName: string, contentType: string, size: number) {
  if (!s3Enabled()) throw new Error("File upload is not configured. Paste a file URL instead.");
  if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    throw new Error(`File must be 1 byte – ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`);
  }
  client ??= new S3Client({
    region: env.s3.region,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  // Random segment: the bucket is public, so the key is what keeps a file unguessable.
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = `${PREFIX}/${month}/${randomUUID()}-${safeName(fileName)}`;
  const uploadUrl = await getSignedUrl(
    client,
    // ContentLength + ContentType are signed: S3 refuses a body that differs.
    new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: env.s3.presignExpires },
  );
  return { uploadUrl, url: publicUrl(key) };
}
