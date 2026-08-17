import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4173);
const ROOT = new URL(".", import.meta.url).pathname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const timePeriods = new Set(["DAY", "WEEK", "MONTH", "ALL"]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function proxyJson(res, url) {
  const upstream = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "polymarket-builder-explorer/0.1",
    },
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

async function handleApi(req, res, requestUrl) {
  if (requestUrl.pathname === "/api/builders/leaderboard") {
    const timePeriod = timePeriods.has(requestUrl.searchParams.get("timePeriod"))
      ? requestUrl.searchParams.get("timePeriod")
      : "MONTH";
    const limit = clampInt(requestUrl.searchParams.get("limit"), 50, 1, 50);
    const offset = clampInt(requestUrl.searchParams.get("offset"), 0, 0, 1000);
    const upstream = new URL("https://data-api.polymarket.com/v1/builders/leaderboard");
    upstream.searchParams.set("timePeriod", timePeriod);
    upstream.searchParams.set("limit", String(limit));
    upstream.searchParams.set("offset", String(offset));
    await proxyJson(res, upstream);
    return;
  }

  if (requestUrl.pathname === "/api/builders/volume") {
    const timePeriod = timePeriods.has(requestUrl.searchParams.get("timePeriod"))
      ? requestUrl.searchParams.get("timePeriod")
      : "MONTH";
    const upstream = new URL("https://data-api.polymarket.com/v1/builders/volume");
    upstream.searchParams.set("timePeriod", timePeriod);
    await proxyJson(res, upstream);
    return;
  }

  if (requestUrl.pathname === "/api/builder/trades") {
    const builderCode = requestUrl.searchParams.get("builder_code") || "";
    if (!/^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
      sendJson(res, 400, { error: "builder_code must be a 32-byte hex value" });
      return;
    }
    const upstream = new URL("https://clob.polymarket.com/builder/trades");
    upstream.searchParams.set("builder_code", builderCode);
    for (const key of ["id", "market", "asset_id", "before", "after", "next_cursor"]) {
      const value = requestUrl.searchParams.get(key);
      if (value) upstream.searchParams.set(key, value);
    }
    await proxyJson(res, upstream);
    return;
  }

  if (requestUrl.pathname === "/api/builder/fees") {
    const builderCode = requestUrl.searchParams.get("builder_code") || "";
    if (!/^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
      sendJson(res, 400, { error: "builder_code must be a 32-byte hex value" });
      return;
    }
    const upstream = new URL(
      `https://clob.polymarket.com/fees/builder-fees/${builderCode}`,
    );
    await proxyJson(res, upstream);
    return;
  }

  if (requestUrl.pathname === "/api/markets") {
    const conditionIds = requestUrl.searchParams
      .getAll("condition_ids")
      .filter((value) => /^0x[a-fA-F0-9]{64}$/.test(value))
      .slice(0, 50);
    if (!conditionIds.length) {
      sendJson(res, 400, { error: "condition_ids must contain at least one 32-byte hex value" });
      return;
    }
    const upstream = new URL("https://gamma-api.polymarket.com/markets");
    for (const conditionId of conditionIds) {
      upstream.searchParams.append("condition_ids", conditionId);
    }
    await proxyJson(res, upstream);
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

async function serveStatic(res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }
    await serveStatic(res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(PORT, () => {
  console.log(`Polymarket Builder Explorer: http://localhost:${PORT}`);
});
