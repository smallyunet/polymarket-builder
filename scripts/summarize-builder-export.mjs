import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const exportRoot = process.argv[2] || await latestExportRoot();
const outputFile = process.argv[3] || join("data", "reports", `${basename(exportRoot)}-summary.txt`);

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, digits = 2) {
  return number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtInt(value) {
  return String(Math.round(number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function shortCode(code) {
  return code ? `${code.slice(0, 10)}...${code.slice(-6)}` : "";
}

function normalizeName(value) {
  return String(value || "Unknown").trim() || "Unknown";
}

async function latestExportRoot() {
  const root = join("data", "builder-export");
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!dirs.length) throw new Error(`No export directories found under ${root}`);
  return join(root, dirs.at(-1));
}

function rankBuilders(builders, period) {
  return [...builders]
    .filter((builder) => builder.periods?.[period])
    .sort((a, b) => number(a.periods[period].rank) - number(b.periods[period].rank));
}

function bucketCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = normalizeName(keyFn(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function tradeStatsForRows(rows) {
  const volume = rows.reduce((sum, row) => sum + number(row.sizeUsdc), 0);
  const fees = rows.reduce((sum, row) => sum + number(row.feeUsdc), 0);
  const firstCreatedAt = rows.map((row) => row.createdAt).filter(Boolean).sort()[0] || "";
  const lastCreatedAt = rows.map((row) => row.createdAt).filter(Boolean).sort().at(-1) || "";
  return { rows: rows.length, volume, fees, firstCreatedAt, lastCreatedAt };
}

function topList(counts, limit = 20) {
  return counts.slice(0, limit).map(([key, count], index) => `${index + 1}. ${key}: ${fmtInt(count)}`).join("\n");
}

function builderLine(builder, tradeByCode) {
  const trades = tradeByCode.get(builder.builderCode);
  const stats = tradeStatsForRows(trades?.rows || []);
  const all = builder.periods.ALL || {};
  const month = builder.periods.MONTH || {};
  const week = builder.periods.WEEK || {};
  const day = builder.periods.DAY || {};
  return [
    normalizeName(builder.builder),
    builder.verified ? "verified" : "unverified",
    builder.builderCode,
    `ALL rank=${all.rank ?? ""} volume=${fmt(all.volume || 0)} users=${fmtInt(all.activeUsers || 0)}`,
    `MONTH rank=${month.rank ?? ""} volume=${fmt(month.volume || 0)} users=${fmtInt(month.activeUsers || 0)}`,
    `WEEK rank=${week.rank ?? ""} volume=${fmt(week.volume || 0)} users=${fmtInt(week.activeUsers || 0)}`,
    `DAY rank=${day.rank ?? ""} volume=${fmt(day.volume || 0)} users=${fmtInt(day.activeUsers || 0)}`,
    `sampleTrades=${fmtInt(stats.rows)} sampleTradeVolume=${fmt(stats.volume)} sampleFees=${fmt(stats.fees)}`,
    `sampleRange=${stats.firstCreatedAt || "n/a"}..${stats.lastCreatedAt || "n/a"}`,
    `moreTradesAvailable=${Boolean(trades?.nextCursor)}`,
    `logo=${builder.builderLogo || ""}`,
  ].join(" | ");
}

const [builders, volumes, trades] = await Promise.all([
  readFile(join(exportRoot, "builders.json"), "utf8").then(JSON.parse),
  readFile(join(exportRoot, "volumes.json"), "utf8").then(JSON.parse),
  readFile(join(exportRoot, "trades.json"), "utf8").then(JSON.parse),
]);

const tradeByCode = new Map(trades.map((entry) => [entry.builderCode, entry]));
const allTradeRows = trades.flatMap((entry) => entry.rows || []);
const allTradeStats = tradeStatsForRows(allTradeRows);
const verifiedCount = builders.filter((builder) => builder.verified).length;
const generatedAt = new Date().toISOString();
const periods = ["ALL", "MONTH", "WEEK", "DAY"];

const volumeCoverage = Object.entries(volumes).map(([period, rows]) => {
  const dates = [...new Set(rows.map((row) => row.dt).filter(Boolean))].sort();
  const builderCount = new Set(rows.map((row) => row.builderCode).filter(Boolean)).size;
  const totalVolume = rows.reduce((sum, row) => sum + number(row.volume), 0);
  return `${period}: rows=${fmtInt(rows.length)}, builders=${fmtInt(builderCount)}, dates=${dates.length}, first=${dates[0] || ""}, last=${dates.at(-1) || ""}, rowVolumeSum=${fmt(totalVolume)}`;
}).join("\n");

const topByPeriod = periods.map((period) => {
  const lines = rankBuilders(builders, period).slice(0, 25).map((builder) => {
    const p = builder.periods[period];
    return `${p.rank}. ${normalizeName(builder.builder)} (${shortCode(builder.builderCode)}): volume=${fmt(p.volume)}, activeUsers=${fmtInt(p.activeUsers)}, verified=${builder.verified}`;
  }).join("\n");
  return `Top builders by ${period}\n${lines}`;
}).join("\n\n");

const tradeByBuilder = [...trades]
  .sort((a, b) => number(tradeStatsForRows(b.rows || []).volume) - number(tradeStatsForRows(a.rows || []).volume))
  .slice(0, 50)
  .map((entry, index) => {
    const builder = builders.find((item) => item.builderCode === entry.builderCode);
    const stats = tradeStatsForRows(entry.rows || []);
    return `${index + 1}. ${normalizeName(builder?.builder)} (${shortCode(entry.builderCode)}): rows=${fmtInt(stats.rows)}, sizeUsdc=${fmt(stats.volume)}, feesUsdc=${fmt(stats.fees)}, range=${stats.firstCreatedAt || "n/a"}..${stats.lastCreatedAt || "n/a"}, more=${Boolean(entry.nextCursor)}`;
  }).join("\n");

const allBuilderLines = builders
  .sort((a, b) => number(a.periods.ALL?.rank || 999999) - number(b.periods.ALL?.rank || 999999))
  .map((builder, index) => `${index + 1}. ${builderLine(builder, tradeByCode)}`)
  .join("\n");

const content = `Polymarket Builder Export Summary
Generated At: ${generatedAt}
Input Export Directory: ${exportRoot}

Purpose:
This is a single text summary generated from the local export directory. It is designed for AI analysis and contains normalized builder metadata, ranking/volume/user metrics across periods, volume coverage, and recent-trade aggregates. Raw JSON/CSV files remain in the export directory for deeper drill-down.

Source Files:
- ${join(exportRoot, "REPORT.md")}
- ${join(exportRoot, "builders.csv")}
- ${join(exportRoot, "builders.json")}
- ${join(exportRoot, "volumes.json")}
- ${join(exportRoot, "trades.json")}
- ${join(exportRoot, "raw")}

Overall Coverage:
- Builders discovered: ${fmtInt(builders.length)}
- Verified builders: ${fmtInt(verifiedCount)}
- Unverified builders: ${fmtInt(builders.length - verifiedCount)}
- Builders with sampled trades: ${fmtInt(trades.length)}
- Sampled trade rows: ${fmtInt(allTradeStats.rows)}
- Sampled trade sizeUsdc total: ${fmt(allTradeStats.volume)}
- Sampled trade feeUsdc total: ${fmt(allTradeStats.fees)}
- Sampled trade createdAt range: ${allTradeStats.firstCreatedAt || "n/a"}..${allTradeStats.lastCreatedAt || "n/a"}
- Builders with more trade cursor data available: ${fmtInt(trades.filter((entry) => entry.nextCursor).length)}

Volume Coverage:
${volumeCoverage}

Recent Trade Distributions:
Trade type counts:
${topList(bucketCount(allTradeRows, (row) => row.tradeType), 20)}

Side counts:
${topList(bucketCount(allTradeRows, (row) => row.side), 20)}

Status counts:
${topList(bucketCount(allTradeRows, (row) => row.status), 20)}

Outcome counts:
${topList(bucketCount(allTradeRows, (row) => row.outcome), 20)}

Top markets by sampled trade count:
${topList(bucketCount(allTradeRows, (row) => row.market), 30)}

${topByPeriod}

Top Builders By Sampled Recent Trade Volume:
${tradeByBuilder}

All Builders:
Format:
index. name | verification | builderCode | ALL rank/volume/users | MONTH rank/volume/users | WEEK rank/volume/users | DAY rank/volume/users | sampled trade metrics | sampled range | cursor availability | logo

${allBuilderLines}

Analysis Notes:
- The leaderboard and volume datasets cover DAY, WEEK, MONTH, and ALL.
- Builder trades are sampled from the latest exported pages. If moreTradesAvailable=true, the builder has additional cursor pages beyond this summary.
- Use rank movement across DAY/WEEK/MONTH/ALL to identify accelerating or fading builders.
- Use verified status, active user counts, and sampled trade volume together; a high volume with low activeUsers can indicate concentrated or programmatic use.
- Use raw JSON files for exact trade-level market, assetId, owner, maker, transactionHash, fee, status, and timestamp fields.
`;

await writeFile(outputFile, content);
console.log(outputFile);
