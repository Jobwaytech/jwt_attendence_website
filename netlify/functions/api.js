import serverless from "serverless-http";
import app, { initializeRuntime } from "../../backend/server.js";

let cachedHandler;

export async function handler(event, context) {
  await initializeRuntime();
  cachedHandler ||= serverless(app);
  return cachedHandler(event, context);
}
