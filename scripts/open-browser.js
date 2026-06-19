import http from "node:http";
import https from "node:https";
import { exec } from "node:child_process";

const targetUrl = process.argv[2] || "https://localhost:3000";
const deadline = Date.now() + 45_000;

function check(url) {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve) => {
    const request = client.get(url, { rejectUnauthorized: false }, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function open(url) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(command);
}

async function waitAndOpen() {
  while (Date.now() < deadline) {
    if (await check(targetUrl)) {
      open(targetUrl);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  open(targetUrl);
}

waitAndOpen();
