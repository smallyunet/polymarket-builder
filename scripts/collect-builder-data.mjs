import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PERIODS = ["DAY", "WEEK", "MONTH", "ALL"];
const API_HEADERS = {
  accept: "application/json",
  "user-agent": "polymarket-builder-explorer-export/0.1",
};

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = join("data", "builder-export", runId);
const rawDir = join(outputRoot, "raw");

const tradeBuilderLimit = intEnv("TRADE_BUILDER_LIMIT", 0);
const tradeMaxPages = intEnv("TRADE_MAX_PAGES", 1);
const tradeConcurrency = intEnv("TRADE_CONCURRENCY", 4);
const requestDelayMs = intEnv("REQUEST_DELAY_MS", 120);

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function shortCode(code) {
  return code ? `${code.slice(0, 10)}...${code.slice(-6)}` : "";
}

async function fetchJson(url, context) {
  const response = await fetch(url, { headers: API_HEADERS });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return JSON.parse(text);
}

async function fetchLeaderboard(period) {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL("https://data-api.polymarket.com/v1/builders/leaderboard");
    url.searchParams.set("timePeriod", period);
    url.searchParams.set("limit", "50");
    url.searchParams.set("offset", String(offset));
    const page = await fetchJson(url, `leaderboard ${period} offset ${offset}`);
    rows.push(...page);
    if (!Array.isArray(page) || page.length < 50) break;
    offset += page.length;
    await sleep(requestDelayMs);
  }
  return rows;
}

async function fetchVolume(period) {
  const url = new URL("https://data-api.polymarket.com/v1/builders/volume");
  url.searchParams.set("timePeriod", period);
  return fetchJson(url, `volume ${period}`);
}

async function fetchTradePages(builderCode) {
  const pages = [];
  let cursor = "";
  let pageNo = 0;
  while (true) {
    const url = new URL("https://clob.polymarket.com/builder/trades");
    url.searchParams.set("builder_code", builderCode);
    if (cursor) url.searchParams.set("next_cursor", cursor);
    const payload = await fetchJson(url, `trades ${shortCode(builderCode)} page ${pageNo + 1}`);
    pages.push(payload);
    pageNo += 1;
    cursor = payload.next_cursor || "";
    if (!cursor) break;
    if (tradeMaxPages > 0 && pageNo >= tradeMaxPages) break;
    await sleep(requestDelayMs);
  }
  return {
    builderCode,
    pages,
    rows: pages.flatMap((page) => page.data || []),
    nextCursor: pages.at(-1)?.next_cursor || null,
    reachedEnd: !pages.at(-1)?.next_cursor,
  };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
      await sleep(requestDelayMs);
    }
  });
  await Promise.all(workers);
  return results;
}

function mergeBuilders(leaderboards) {
  const builders = new Map();
  for (const [period, rows] of Object.entries(leaderboards)) {
    for (const row of rows) {
      const code = row.builderCode || "";
      if (!code) continue;
      const existing = builders.get(code) || {
        builderCode: code,
        builder: row.builder || "",
        verified: Boolean(row.verified),
        builderLogo: row.builderLogo || "",
        periods: {},
      };
      existing.builder ||= row.builder || "";
      existing.verified ||= Boolean(row.verified);
      existing.builderLogo ||= row.builderLogo || "";
      existing.periods[period] = {
        rank: Number(row.rank || 0),
        volume: money(row.volume),
        activeUsers: Number(row.activeUsers || 0),
      };
      builders.set(code, existing);
    }
  }
  return [...builders.values()].sort((a, b) => {
    return (b.periods.ALL?.volume || 0) - (a.periods.ALL?.volume || 0);
  });
}

function summarizeVolumes(volumes) {
  return Object.fromEntries(Object.entries(volumes).map(([period, rows]) => {
    const dates = new Set(rows.map((row) => row.dt).filter(Boolean));
    return [period, {
      rows: rows.length,
      dates: dates.size,
      firstDate: [...dates].sort()[0] || "",
      lastDate: [...dates].sort().at(-1) || "",
      builders: new Set(rows.map((row) => row.builderCode).filter(Boolean)).size,
    }];
  }));
}

function buildCsv(builders, tradeResults) {
  const tradeMap = new Map(tradeResults.map((item) => [item.builderCode, item]));
  const columns = [
    "builder",
    "builderCode",
    "verified",
    "logo",
    "rankDAY",
    "volumeDAY",
    "activeUsersDAY",
    "rankWEEK",
    "volumeWEEK",
    "activeUsersWEEK",
    "rankMONTH",
    "volumeMONTH",
    "activeUsersMONTH",
    "rankALL",
    "volumeALL",
    "activeUsersALL",
    "sampleTradeCount",
    "sampleTradePages",
    "sampleTradesReachedEnd",
    "sampleTradesNextCursor",
  ];
  const lines = [columns.join(",")];
  for (const builder of builders) {
    const trade = tradeMap.get(builder.builderCode);
    lines.push(columns.map((column) => {
      if (column === "builder") return csvCell(builder.builder);
      if (column === "builderCode") return builder.builderCode;
      if (column === "verified") return String(builder.verified);
      if (column === "logo") return csvCell(builder.builderLogo);
      if (column === "sampleTradeCount") return String(trade?.rows.length || 0);
      if (column === "sampleTradePages") return String(trade?.pages.length || 0);
      if (column === "sampleTradesReachedEnd") return String(Boolean(trade?.reachedEnd));
      if (column === "sampleTradesNextCursor") return trade?.nextCursor || "";
      const match = column.match(/^(rank|volume|activeUsers)(DAY|WEEK|MONTH|ALL)$/);
      if (match) return String(builder.periods[match[2]]?.[match[1]] ?? "");
      return "";
    }).join(","));
  }
  return lines.join("\n");
}

function buildReport({ leaderboards, volumes, builders, tradeResults, startedAt, finishedAt }) {
  const tradeMap = new Map(tradeResults.map((item) => [item.builderCode, item]));
  const totalTrades = tradeResults.reduce((sum, item) => sum + item.rows.length, 0);
  const volumeSummary = summarizeVolumes(volumes);
  const topRows = builders.slice(0, 30).map((builder) => {
    const trade = tradeMap.get(builder.builderCode);
    return [
      builder.builder || "Unnamed",
      shortCode(builder.builderCode),
      builder.verified ? "yes" : "no",
      builder.periods.ALL?.rank || "",
      builder.periods.ALL?.volume?.toFixed(2) || "",
      builder.periods.MONTH?.volume?.toFixed(2) || "",
      builder.periods.WEEK?.volume?.toFixed(2) || "",
      builder.periods.DAY?.volume?.toFixed(2) || "",
      trade?.rows.length || 0,
      trade?.reachedEnd ? "complete" : (trade?.nextCursor ? "more available" : "none"),
    ];
  });

  return `# Polymarket Builder Data Export

Generated: ${finishedAt}

## Scope

- Source endpoints:
  - \`GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=50&offset=N\`
  - \`GET https://data-api.polymarket.com/v1/builders/volume?timePeriod={DAY|WEEK|MONTH|ALL}\`
  - \`GET https://clob.polymarket.com/builder/trades?builder_code=0x...&next_cursor=...\`
- Started at: ${startedAt}
- Finished at: ${finishedAt}
- Unique builders discovered: ${builders.length}
- Trade collection: ${tradeResults.length} builders, ${tradeMaxPages === 0 ? "unlimited" : tradeMaxPages} page(s) per builder, ${totalTrades} trade rows
- Output directory: \`${outputRoot}\`

## Parameter Notes

- \`timePeriod\` values used by the current web app: \`DAY\`, \`WEEK\`, \`MONTH\`, \`ALL\`.
- Leaderboard pagination uses \`limit=50\` and increasing \`offset\` until a page returns fewer than 50 rows.
- Builder trades use cursor pagination. This export stores \`nextCursor\` for every sampled builder so deeper continuation is possible.
- Optional trade filters accepted by the local proxy are \`id\`, \`market\`, \`asset_id\`, \`before\`, \`after\`, and \`next_cursor\`; this export uses unfiltered recent trades for breadth across builders.

## Leaderboard Coverage

| Period | Rows |
| --- | ---: |
${PERIODS.map((period) => `| ${period} | ${leaderboards[period].length} |`).join("\n")}

## Volume Coverage

| Period | Rows | Builders | Date Points | First Date | Last Date |
| --- | ---: | ---: | ---: | --- | --- |
${PERIODS.map((period) => {
  const s = volumeSummary[period];
  return `| ${period} | ${s.rows} | ${s.builders} | ${s.dates} | ${s.firstDate} | ${s.lastDate} |`;
}).join("\n")}

## Top Builders

| Builder | Builder Code | Verified | All Rank | All Volume | Month Volume | Week Volume | Day Volume | Sample Trades | Trade Cursor |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${topRows.map((row) => `| ${row.map(csvCell).join(" | ")} |`).join("\n")}

## Files For AI Analysis

- \`builders.csv\`: one row per builder, with period ranks/volumes/users and trade sample metadata.
- \`builders.json\`: normalized builder objects keyed by discovered builderCode.
- \`volumes.json\`: all volume rows for each supported timePeriod.
- \`trades.json\`: sampled trade rows grouped by builderCode.
- \`raw/\`: unmodified endpoint payloads by endpoint and period/builder.

## Suggested Analysis Angles

- Compare \`ALL\`, \`MONTH\`, \`WEEK\`, and \`DAY\` rank movement for builder momentum.
- Segment verified vs unverified builders by volume, active users, and recent trade availability.
- Use \`volumes.json\` to reconstruct time series per builderCode.
- Use \`trades.json\` for market, side, size, owner, maker, fee, and status distributions from recent activity.
`;
}

await mkdir(rawDir, { recursive: true });
const startedAt = new Date().toISOString();

const leaderboards = {};
for (const period of PERIODS) {
  console.log(`Fetching leaderboard ${period}`);
  leaderboards[period] = await fetchLeaderboard(period);
  await writeFile(join(rawDir, `leaderboard-${period}.json`), JSON.stringify(leaderboards[period], null, 2));
}

const volumes = {};
for (const period of PERIODS) {
  console.log(`Fetching volume ${period}`);
  volumes[period] = await fetchVolume(period);
  await writeFile(join(rawDir, `volume-${period}.json`), JSON.stringify(volumes[period], null, 2));
}

const builders = mergeBuilders(leaderboards);
const tradeBuilders = tradeBuilderLimit > 0 ? builders.slice(0, tradeBuilderLimit) : builders;
console.log(`Fetching trades for ${tradeBuilders.length} builder(s)`);
const tradeResults = await mapConcurrent(tradeBuilders, tradeConcurrency, async (builder, index) => {
  console.log(`Trades ${index + 1}/${tradeBuilders.length}: ${builder.builder || shortCode(builder.builderCode)}`);
  const result = await fetchTradePages(builder.builderCode);
  await writeFile(join(rawDir, `trades-${builder.builderCode}.json`), JSON.stringify(result.pages, null, 2));
  return result;
});

const finishedAt = new Date().toISOString();
await writeFile(join(outputRoot, "builders.json"), JSON.stringify(builders, null, 2));
await writeFile(join(outputRoot, "volumes.json"), JSON.stringify(volumes, null, 2));
await writeFile(join(outputRoot, "trades.json"), JSON.stringify(tradeResults, null, 2));
await writeFile(join(outputRoot, "builders.csv"), buildCsv(builders, tradeResults));
await writeFile(join(outputRoot, "REPORT.md"), buildReport({
  leaderboards,
  volumes,
  builders,
  tradeResults,
  startedAt,
  finishedAt,
}));

console.log(`Done: ${outputRoot}`);
