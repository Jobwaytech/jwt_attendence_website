const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [1_500, 3_500];

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const method = (init.method || "GET").toUpperCase();
  const path = typeof input === "string" ? input : input.toString();
  const canRetry =
    ["GET", "HEAD", "OPTIONS"].includes(method) ||
    (method === "POST" && /\/api\/login(?:[/?]|$)/.test(path));
  const attempts = canRetry ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === attempts - 1
      ) {
        return response;
      }
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }

    await wait(RETRY_DELAYS_MS[attempt]);
  }

  throw new Error("The request could not be completed.");
}
