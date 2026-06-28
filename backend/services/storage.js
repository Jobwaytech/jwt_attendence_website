import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  join(
    process.env.NETLIFY === "true" || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? tmpdir()
      : process.cwd(),
    "frontend",
    "public",
    "uploads",
  );

function extensionFromMime(mimeType = "") {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("pdf")) return "pdf";
  return "bin";
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Upload must be a base64 data URL.");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function uploadCloudinary({ dataUrl, category }) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) return null;
  const form = new FormData();
  form.set("file", dataUrl);
  form.set("upload_preset", preset);
  form.set("folder", `job-way-tech/${category}`);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`,
    { method: "POST", body: form },
  );
  if (!response.ok) throw new Error("Cloudinary upload failed.");
  const data = await response.json();
  return {
    provider: "cloudinary",
    url: data.secure_url,
    publicId: data.public_id,
    size: data.bytes,
  };
}

export async function storeFile({
  dataUrl,
  category,
  originalName = "upload",
}) {
  const cloudinary = await uploadCloudinary({ dataUrl, category });
  if (cloudinary) return cloudinary;

  const { mimeType, buffer } = parseDataUrl(dataUrl);
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${category}-${randomUUID()}.${extensionFromMime(mimeType)}`;
  writeFileSync(join(UPLOAD_DIR, filename), buffer);
  return {
    provider: "local",
    url: `/uploads/${filename}`,
    publicId: filename,
    size: buffer.length,
    mimeType,
    originalName,
  };
}
