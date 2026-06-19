import { apiRequest } from "./api";

export type FaceSample = {
  label: string;
  imageData: string;
  vector: number[];
  capturedAt: string;
};

export type LivenessChallenge = "blink" | "turn_left" | "turn_right" | "smile";

export type VerificationPayload = {
  userId: string;
  imageData: string;
  embedding: number[];
  livenessChallenge: LivenessChallenge;
  livenessVerified: boolean;
  gps: {
    latitude: number;
    longitude: number;
    address: string;
    capturedAt?: string;
  };
  browserFingerprint: string;
  deviceInfo: string;
};

const FACE_SAMPLE_LABELS = ["front", "left", "right", "smile", "neutral"];
const LIVENESS_CHALLENGES: LivenessChallenge[] = ["blink", "turn_left", "turn_right", "smile"];

let librariesPrepared = false;

export async function prepareFaceLibraries() {
  if (librariesPrepared || typeof window === "undefined") return;
  await Promise.allSettled([
    import("face-api.js"),
    import("@mediapipe/face_detection"),
  ]);
  librariesPrepared = true;
}

export function nextFaceSampleLabel(index: number) {
  return FACE_SAMPLE_LABELS[index] || `sample-${index + 1}`;
}

export function randomLivenessChallenge() {
  return LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)];
}

export function livenessInstruction(challenge: LivenessChallenge) {
  return {
    blink: "Blink once, then keep your face centered.",
    turn_left: "Turn your head left, then face the camera.",
    turn_right: "Turn your head right, then face the camera.",
    smile: "Smile clearly, then face the camera.",
  }[challenge];
}

export function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to read the camera frame.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function imageEmbeddingFromDataUrl(dataUrl: string) {
  await prepareFaceLibraries();
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new Image();
    item.onload = () => resolve(item);
    item.onerror = () => reject(new Error("Unable to read face image."));
    item.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to generate face embedding.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const vector: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 / 255;
    vector.push(Number((gray * 2 - 1).toFixed(5)));
  }
  return vector;
}

export async function captureFaceSample(video: HTMLVideoElement, label: string): Promise<FaceSample> {
  const imageData = captureVideoFrame(video);
  return {
    label,
    imageData,
    vector: await imageEmbeddingFromDataUrl(imageData),
    capturedAt: new Date().toISOString(),
  };
}

export async function runLivenessChallenge(video: HTMLVideoElement, notify: (message: string) => void) {
  const challenge = randomLivenessChallenge();
  notify(livenessInstruction(challenge));
  await new Promise((resolve) => window.setTimeout(resolve, 1400));
  const first = captureVideoFrame(video);
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  const second = captureVideoFrame(video);
  const [a, b] = await Promise.all([imageEmbeddingFromDataUrl(first), imageEmbeddingFromDataUrl(second)]);
  const delta = a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] || 0)), 0) / a.length;
  return { challenge, livenessVerified: delta > 0.002 };
}

export async function browserFingerprint() {
  const value = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function deviceInfo() {
  return `${navigator.platform || "unknown"} | ${navigator.userAgent}`;
}

export async function registerFaceProfile(userId: string, samples: FaceSample[]) {
  return apiRequest<{ message: string; profile: unknown }>("/api/face/register", {
    method: "POST",
    body: JSON.stringify({
      userId,
      faceEmbeddings: samples.map((sample) => ({
        label: sample.label,
        vector: sample.vector,
        capturedAt: sample.capturedAt,
      })),
    }),
  });
}

export async function verifyFace(payload: VerificationPayload) {
  return apiRequest<{ approved: boolean; faceVerified: boolean; livenessVerified: boolean; matchScore: number; message: string }>("/api/face/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function clockAttendance(type: "clockin" | "clockout", payload: VerificationPayload) {
  const token = typeof window !== "undefined" ? localStorage.getItem("authflow_next_token") : null;
  const response = await fetch(`/api/attendance/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 422) throw new Error(data.message || `Request failed with status ${response.status}.`);
  return data as { attendance: unknown; approved: boolean; warning?: string; message: string };
}

export async function attendanceHistory(limit = 100) {
  return apiRequest<{ attendances: unknown[] }>(`/api/attendance/history?limit=${limit}`);
}
