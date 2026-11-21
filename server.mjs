/**
 * Zero-dependency localhost server.
 *   GET /                -> the app
 *   GET /api/report?ign= -> shard + fusion report for a player
 *   POST /api/shutdown   -> stop the server (the page's shut-down button)
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, loadDescriptions, loadFusion } from "./lib/fusion.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PROFILE_API = "https://api.skyshards.com/skyshards/profile";
const profileCache = new Map();
const CACHE_MS = 60_000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

async function fetchProfile(ign) {
  const key = ign.toLowerCase();
  const hit = profileCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const res = await fetch(`${PROFILE_API}/${encodeURIComponent(ign)}`, {
    headers: { accept: "application/json", "user-agent": "skyshards-fusable/1.0 (local)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) throw Object.assign(new Error(`No SkyBlock player named "${ign}" found.`), { status: 404 });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`Shard API returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`), { status: 502 });
  }
  const data = await res.json();
  profileCache.set(key, { at: Date.now(), data });
  return data;
}

async function handleApi(req, res, url) {
  if (url.pathname !== "/api/report") return sendJson(res, 404, { error: "Unknown endpoint." });

  const ign = (url.searchParams.get("ign") ?? "").trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(ign)) {
    return sendJson(res, 400, { error: "Enter a Minecraft username (1-16 letters, numbers or underscores)." });
  }

  try {
    const [fusion, descriptions, profile] = await Promise.all([loadFusion(), loadDescriptions(), fetchProfile(ign)]);
    sendJson(res, 200, buildReport(fusion, profile, { ignFallback: ign, descriptions }));
  } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) console.error(`[report] ${ign}: ${error.message}`);
    sendJson(res, status, { error: error.message });
  }
}

// The page needs a custom header, so another site cannot stop the server with a
// plain cross-origin form post (that request would need a CORS preflight).
function handleShutdown(req, res) {
  if (req.headers["x-skyshards-shutdown"] !== "1") {
    return sendJson(res, 400, { error: "Missing shutdown header." });
  }
  sendJson(res, 200, { ok: true, message: "Server shutting down." });
  setTimeout(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  }, 100);
}

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "POST" && url.pathname === "/api/shutdown") return handleShutdown(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(res, url.pathname);
});

// Load the data files at boot so a broken file fails loudly instead of on first request.
await Promise.all([loadFusion(), loadDescriptions()]);

server.listen(PORT, HOST, () => {
  console.log(`SkyShards Fusable running at http://${HOST}:${PORT}`);
  console.log("Open that URL, type your IGN, press Analyze.");
  console.log('Use the "Shut down server" button on the page to stop it.');
});
